import { supabase } from './supabase-client.js';
import { onAuthStateChanged } from './supabase-auth.js';

const grid = document.querySelector('#resource-grid');
const status = document.querySelector('#resource-status');
const template = document.querySelector('#resource-card-template');
const searchInput = document.querySelector('#resource-search');
const typeFilter = document.querySelector('#resource-type-filter');
const categoryFilter = document.querySelector('#resource-category-filter');
const sortSelect = document.querySelector('#resource-sort');
const bucketName = 'resource-releases';
const maxDownloadBytes = 50 * 1024 * 1024;
const signInUrl = 'auth.html?returnTo=library#signup';
const isDetailPage = window.location.pathname.endsWith('resource-detail.html');

if (grid && status && template) {
    let currentUser = null;
    let catalogEntries = [];
    let downloadCounts = new Map();
    let downloadCountsAvailable = true;

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function formatBytes(size) {
        if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function hexDigest(buffer) {
        return [...new Uint8Array(buffer)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function setCardStatus(card, message, kind = '') {
        const messageElement = card.querySelector('.resource-card-status');
        messageElement.textContent = message;
        messageElement.dataset.kind = kind;
    }

    function setResourceMeta(resource) {
        document.title = `${resource.title} | Desalu Engineering`;
        const description = document.querySelector('meta[name="description"]');
        if (description) description.content = resource.summary;
        const openGraphTitle = document.querySelector('meta[property="og:title"]');
        const openGraphDescription = document.querySelector('meta[property="og:description"]');
        const openGraphImage = document.querySelector('meta[property="og:image"]');
        if (openGraphTitle) openGraphTitle.content = `${resource.title} | Desalu Engineering`;
        if (openGraphDescription) openGraphDescription.content = resource.summary;
        if (openGraphImage && resource.icon_url) openGraphImage.content = resource.icon_url;
    }

    function addExternalLink(container, label, url) {
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.textContent = label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        container.append(link);
    }

    async function toggleBookmark(resourceId, resourceTitle, button, card) {
        if (!currentUser) {
            window.location.href = signInUrl;
            return;
        }

        button.disabled = true;
        try {
            const { data: existing, error: lookupError } = await supabase
                .from('bookmarks')
                .select('resource_id')
                .eq('resource_id', resourceId)
                .maybeSingle();
            if (lookupError) throw lookupError;

            if (existing) {
                const { error } = await supabase.from('bookmarks').delete().eq('resource_id', resourceId);
                if (error) throw error;
                button.textContent = 'Bookmark';
                setCardStatus(card, 'Removed from your bookmarks.');
            } else {
                const { error } = await supabase.from('bookmarks').upsert({
                    resource_id: resourceId,
                    resource_title: resourceTitle,
                    user_id: currentUser.id
                }, { onConflict: 'user_id,resource_id' });
                if (error) throw error;
                button.textContent = 'Bookmarked';
                setCardStatus(card, 'Saved to your workspace.');
            }
        } catch (error) {
            console.error('Could not update this resource bookmark.', error);
            setCardStatus(card, 'Your bookmark could not be updated. Please try again.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function submitResourceReport(event, resource, card) {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        const reportStatus = card.querySelector('.resource-report-status');
        const message = form.elements.message.value.trim();

        if (!currentUser) {
            const signIn = new URL('auth.html', window.location.href);
            signIn.searchParams.set('returnTo', 'resourceDetail');
            signIn.searchParams.set('resourceId', resource.id);
            signIn.hash = 'signup';
            window.location.href = signIn.toString();
            return;
        }
        if (message.length < 10 || message.length > 2000) {
            reportStatus.textContent = 'Describe the issue using 10 to 2,000 characters.';
            reportStatus.dataset.kind = 'error';
            return;
        }

        submitButton.disabled = true;
        reportStatus.textContent = 'Sending report…';
        reportStatus.dataset.kind = '';
        try {
            const { error } = await supabase.from('resource_reports').insert({
                resource_id: resource.id,
                reason: form.elements.reason.value,
                message
            });
            if (error?.code === '23505') {
                reportStatus.textContent = 'You already have a pending report for this resource.';
                reportStatus.dataset.kind = 'error';
                return;
            }
            if (error) throw error;
            form.reset();
            reportStatus.textContent = 'Your report was sent to the staff review queue.';
        } catch (error) {
            console.error('Could not submit a resource report.', error);
            reportStatus.textContent = 'Your report could not be sent. Please try again later.';
            reportStatus.dataset.kind = 'error';
        } finally {
            submitButton.disabled = false;
        }
    }

    async function downloadArtifact(resource, release, artifact, button, card) {
        if (!currentUser) {
            window.location.href = signInUrl;
            return;
        }

        const releasePath = `resources/${resource.id}/releases/${release.id}`;
        const expectedPath = artifact.kind === 'build'
            ? `${releasePath}/build.${release.buildFormat}`
            : artifact.kind === 'source'
                ? `${releasePath}/source.zip`
                : `${releasePath}/artifact.zip`;
        if (artifact.storagePath !== expectedPath
            || !Number.isInteger(artifact.fileSize)
            || artifact.fileSize < 1
            || artifact.fileSize > maxDownloadBytes
            || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
            setCardStatus(card, 'This release has invalid file metadata and cannot be downloaded.', 'error');
            return;
        }

        button.disabled = true;
        setCardStatus(card, `Checking ${artifact.label.toLowerCase()} access and file integrity…`);
        try {
            const { data: blob, error: downloadError } = await supabase.storage
                .from(bucketName)
                .download(artifact.storagePath);
            if (downloadError) throw downloadError;
            if (blob.size !== artifact.fileSize) {
                throw new Error('Downloaded file size does not match the published release.');
            }

            const digest = hexDigest(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
            if (digest !== artifact.sha256) {
                throw new Error('Downloaded file checksum does not match the published release.');
            }

            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = artifact.fileName;
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

            const { error: historyError } = await supabase.from('download_history').insert({
                resource_id: resource.id,
                release_id: release.id,
                resource_title: resource.title,
                version: release.version,
                user_id: currentUser.id
            });
            if (historyError) {
                console.error('The download completed but its history could not be recorded.', historyError);
                setCardStatus(card, 'Download started, but we could not update your history.', 'error');
            } else {
                setCardStatus(card, 'Download started and added to your workspace history.');
            }
        } catch (error) {
            console.error('Could not download the resource release.', error);
            setCardStatus(card, 'Download failed. Check your connection and try again.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    function makeCard(resource, release) {
        const fragment = template.content.cloneNode(true);
        const card = fragment.querySelector('.resource-card');
        const typeLabels = {
            'wordpress-theme': 'WordPress theme',
            'wordpress-plugin': 'WordPress plugin',
            'html-css': 'HTML / CSS / JS',
            'android-app': 'Android app',
            'ios-app': 'iOS app'
        };
        const bookmarkButton = card.querySelector('.resource-bookmark');
        const downloadActions = card.querySelector('.resource-downloads');
        const screenshotList = card.querySelector('.resource-screenshots');
        const externalLinks = card.querySelector('.resource-external-links');
        const isWordPress = ['wordpress-theme', 'wordpress-plugin'].includes(resource.type);
        const artifacts = resource.type === 'android-app'
            ? [
                {
                    kind: 'build',
                    label: `Download Android ${String(release.buildFormat || '').toUpperCase()} build`,
                    storagePath: release.storagePath,
                    fileName: release.fileName,
                    fileSize: release.fileSize,
                    sha256: release.sha256
                },
                {
                    kind: 'source',
                    label: 'Download source project ZIP',
                    storagePath: release.sourceStoragePath,
                    fileName: release.sourceFileName,
                    fileSize: release.sourceFileSize,
                    sha256: release.sourceSha256
                }
            ]
            : [{
                kind: 'release',
                label: 'Download release',
                storagePath: release.storagePath,
                fileName: release.fileName,
                fileSize: release.fileSize,
                sha256: release.sha256
            }];

        card.querySelector('.resource-type').textContent = typeLabels[resource.type] ?? 'Resource';
        card.querySelector('.resource-license').textContent = resource.license;
        card.querySelector('.resource-detail-link').textContent = resource.title;
        card.querySelector('.resource-detail-link').href = `resource-detail.html?id=${encodeURIComponent(resource.id)}`;
        card.querySelector('.resource-summary').textContent = resource.summary;
        card.querySelector('.resource-developer').textContent = resource.developer || `Published by ${resource.author}`;
        card.querySelector('.resource-tags').replaceChildren(...(resource.tags ?? []).map((tag) => {
            const item = document.createElement('li');
            item.textContent = tag;
            return item;
        }));
        if (resource.icon_url) {
            const icon = card.querySelector('.resource-icon');
            icon.src = resource.icon_url;
            icon.alt = `${resource.title} icon`;
            icon.hidden = false;
            icon.addEventListener('error', () => icon.remove(), { once: true });
        } else {
            card.querySelector('.resource-icon').remove();
        }
        if (isDetailPage) {
            card.classList.add('resource-detail-card');
            const reportSection = card.querySelector('.resource-report');
            reportSection.hidden = false;
            card.querySelector('.resource-report-form').addEventListener('submit', (event) => {
                void submitResourceReport(event, resource, card);
            });
            setResourceMeta(resource);
        }
        card.querySelector('.resource-version').textContent = release.version;
        card.querySelector('.resource-wordpress').textContent = release.supportedWordPress || 'Not specified';
        card.querySelector('.resource-php').textContent = release.requiresPHP || 'Not specified';
        card.querySelector('.resource-size').textContent = artifacts
            .map((artifact) => `${artifact.label.replace(/^Download /, '')}: ${formatBytes(artifact.fileSize)}`)
            .join(' · ');
        card.querySelectorAll('.resource-wordpress-detail').forEach((detail) => {
            detail.hidden = !isWordPress;
        });
        card.querySelector('.resource-requirements').textContent = release.requires || 'No additional requirements listed.';
        card.querySelector('.resource-setup-copy').textContent = release.setup;
        card.querySelector('.resource-changelog').textContent = `Release notes: ${release.changelog || 'No changelog provided.'}`;
        card.querySelector('.resource-checksum').textContent = artifacts
            .map((artifact) => `${artifact.fileName}: SHA-256 ${artifact.sha256}`)
            .join(' · ');
        const popularity = document.createElement('div');
        popularity.className = 'resource-popularity';
        popularity.textContent = `${downloadCounts.get(resource.id) ?? 0} downloads`;
        card.querySelector('.resource-details').append(popularity);
        for (const url of resource.screenshots ?? []) {
            const link = document.createElement('a');
            const image = document.createElement('img');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('aria-label', `Open screenshot for ${resource.title}`);
            image.src = url;
            image.alt = `${resource.title} screenshot`;
            image.loading = 'lazy';
            image.addEventListener('error', () => link.remove(), { once: true });
            link.append(image);
            screenshotList.append(link);
        }
        if (!(resource.screenshots ?? []).length) screenshotList.remove();
        addExternalLink(externalLinks, 'Support', resource.support_url);
        addExternalLink(externalLinks, 'Privacy policy', resource.privacy_policy_url);
        if (!resource.support_url && !resource.privacy_policy_url) externalLinks.remove();
        bookmarkButton.textContent = currentUser ? 'Bookmark' : 'Sign in to bookmark';
        artifacts.forEach((artifact) => {
            const downloadButton = document.createElement('button');
            downloadButton.className = 'button resource-download';
            downloadButton.type = 'button';
            downloadButton.textContent = currentUser ? artifact.label : 'Sign in to download';
            downloadButton.addEventListener('click', () => {
                void downloadArtifact(resource, release, artifact, downloadButton, card);
            });
            downloadActions.append(downloadButton);
        });
        bookmarkButton.addEventListener('click', () => {
            void toggleBookmark(resource.id, resource.title, bookmarkButton, card);
        });
        return fragment;
    }

    function applyCatalogFilters() {
        const search = searchInput?.value.trim().toLocaleLowerCase() ?? '';
        const type = typeFilter?.value ?? 'all';
        const category = categoryFilter?.value ?? 'all';
        const sort = isDetailPage ? 'title' : (sortSelect?.value ?? 'title');
        const selectedId = isDetailPage ? new URLSearchParams(window.location.search).get('id') : null;
        if (isDetailPage && !selectedId) {
            grid.replaceChildren();
            setStatus('Choose a resource from the library to view its details.', 'error');
            return;
        }

        const filtered = catalogEntries.filter(({ resource }) => {
            if (selectedId && resource.id !== selectedId) return false;
            if (type !== 'all' && resource.type !== type) return false;
            if (category !== 'all' && resource.category !== category) return false;
            if (!search) return true;
            return [
                resource.id,
                resource.title,
                resource.summary,
                resource.category,
                resource.developer,
                ...(resource.tags ?? [])
            ].some((value) => String(value ?? '').toLocaleLowerCase().includes(search));
        });

        filtered.sort((a, b) => {
            if (sort === 'newest') {
                return new Date(b.release.publishedAt).getTime() - new Date(a.release.publishedAt).getTime();
            }
            if (sort === 'popular') {
                return (downloadCounts.get(b.resource.id) ?? 0) - (downloadCounts.get(a.resource.id) ?? 0);
            }
            return a.resource.title.localeCompare(b.resource.title);
        });

        grid.replaceChildren(...filtered.map(({ resource, release }) => makeCard(resource, release)));
        if (isDetailPage) {
            const resource = filtered[0]?.resource;
            if (!resource) {
                setStatus('This resource is not available or is no longer published.', 'error');
                return;
            }
            setStatus(`Viewing ${resource.title}. Sign in to bookmark or download this approved release.`);
        } else {
            const resultMessage = filtered.length
                ? `${filtered.length} curated ${filtered.length === 1 ? 'resource' : 'resources'} shown.`
                : 'No published resources match your search.';
            setStatus(!downloadCountsAvailable && filtered.length
                ? `${resultMessage} Download popularity is unavailable until the updated database schema is applied.`
                : resultMessage);
        }
    }

    function updateCategoryOptions() {
        if (!categoryFilter) return;
        const selected = categoryFilter.value;
        const categories = [...new Set(catalogEntries.map(({ resource }) => resource.category).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        categoryFilter.replaceChildren(new Option('All categories', 'all'));
        for (const category of categories) categoryFilter.add(new Option(category, category));
        if (categories.includes(selected)) categoryFilter.value = selected;
    }

    async function loadCatalog() {
        if (!supabase) {
            setStatus('The resource catalog is not available until Supabase is configured.', 'error');
            return;
        }

        setStatus('Loading approved resources…');
        try {
            const { data: resources, error: resourcesError } = await supabase
                .from('resources')
                .select('*')
                .eq('status', 'published');
            if (resourcesError) throw resourcesError;

            let releases = [];
            let counts = [];
            if (resources.length) {
                const [releaseResult, countResult] = await Promise.all([
                    supabase.from('resource_releases')
                        .select('*')
                        .in('resource_id', resources.map((resource) => resource.id))
                        .eq('status', 'published'),
                    supabase.rpc('get_public_resource_download_counts')
                ]);
                if (releaseResult.error) throw releaseResult.error;
                releases = releaseResult.data ?? [];
                if (countResult.error?.code === 'PGRST202') {
                    downloadCountsAvailable = false;
                    if (sortSelect) {
                        const popularOption = sortSelect.querySelector('option[value="popular"]');
                        if (popularOption) popularOption.disabled = true;
                    }
                    console.warn('Popular sorting is unavailable until the updated Supabase schema is applied.', countResult.error);
                } else if (countResult.error) {
                    throw countResult.error;
                } else {
                    downloadCountsAvailable = true;
                    counts = countResult.data ?? [];
                }
            }
            downloadCounts = new Map(counts.map((row) => [row.resource_id, Number(row.download_count)]));

            const entries = resources.map((resource) => {
                const release = releases.find((item) => item.id === resource.latest_release_id);
                if (!release) {
                    throw new Error(`Latest release for ${resource.id} is missing or unpublished.`);
                }
                return {
                    resource,
                    release: {
                        id: release.id,
                        version: release.version,
                        supportedWordPress: release.supported_wordpress,
                        requiresPHP: release.requires_php,
                        requires: release.requires,
                        setup: release.setup,
                        changelog: release.changelog,
                        storagePath: release.storage_path,
                        fileName: release.file_name,
                        fileSize: Number(release.file_size),
                        sha256: release.sha256,
                        buildFormat: release.build_format,
                        sourceStoragePath: release.source_storage_path,
                        sourceFileName: release.source_file_name,
                        sourceFileSize: Number(release.source_file_size),
                        sourceSha256: release.source_sha256,
                        publishedAt: release.published_at
                    }
                };
            });
            catalogEntries = entries;
            updateCategoryOptions();
            applyCatalogFilters();
        } catch (error) {
            console.error('Could not load the curated resource catalog.', error);
            setStatus('The resource catalog could not be loaded. Please reload and try again.', 'error');
        }
    }

    if (!supabase) {
        setStatus('Supabase account and catalog services are not configured.', 'error');
    } else {
        searchInput?.addEventListener('input', applyCatalogFilters);
        typeFilter?.addEventListener('change', applyCatalogFilters);
        categoryFilter?.addEventListener('change', applyCatalogFilters);
        sortSelect?.addEventListener('change', applyCatalogFilters);
        onAuthStateChanged((user) => {
            currentUser = user;
            void loadCatalog();
        }, (error) => {
            console.error('Could not check the account for resource access.', error);
            setStatus('Account status could not be checked. Reload and try again.', 'error');
        });
    }
}
