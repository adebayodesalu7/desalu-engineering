import { supabase } from './supabase-client.js';
import { onAuthStateChanged, userIsStaff } from './supabase-auth.js';

const listStatus = document.querySelector('#library-list-status');
const resourceList = document.querySelector('#library-resource-list');
const searchInput = document.querySelector('#library-search');
const statusFilter = document.querySelector('#library-status-filter');
const typeFilter = document.querySelector('#library-type-filter');
const storageScanButton = document.querySelector('#library-storage-scan');
const storageCleanupButton = document.querySelector('#library-storage-cleanup');
const storageFileCount = document.querySelector('#library-storage-files');
const storageUsed = document.querySelector('#library-storage-used');
const storageOrphanCount = document.querySelector('#library-storage-orphans');
const storageStatus = document.querySelector('#library-storage-status');

const releaseBucket = 'resource-releases';
const orphanPathPattern = /^resources\/[a-z0-9]+(?:-[a-z0-9]+)*\/releases\/[0-9a-f-]{36}\/(?:build\.(?:apk|aab)|artifact\.zip|source\.zip)$/i;
let resources = [];
let storageScan = null;

function setStatus(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unit = -1;
    do {
        size /= 1024;
        unit += 1;
    } while (size >= 1024 && unit < units.length - 1);
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function makeButton(label, action, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    if (className) button.className = className;
    return button;
}

function renderResource(resource) {
    const card = document.createElement('article');
    const heading = document.createElement('div');
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    const id = document.createElement('span');
    const badge = document.createElement('span');
    const summary = document.createElement('p');
    const meta = document.createElement('div');
    const type = document.createElement('span');
    const author = document.createElement('span');
    const updated = document.createElement('span');
    const actions = document.createElement('div');
    const historyButton = makeButton('Show release history', 'history');

    card.className = 'library-resource-card';
    card.dataset.resourceId = resource.id;
    heading.className = 'library-resource-card-heading';
    titleGroup.className = 'library-resource-title-group';
    title.textContent = resource.title;
    id.className = 'library-resource-id';
    id.textContent = resource.id;
    badge.className = 'library-status-badge';
    badge.dataset.status = resource.status;
    badge.textContent = resource.status;
    summary.className = 'library-resource-summary';
    summary.textContent = resource.summary;
    meta.className = 'library-resource-meta';
    type.textContent = resource.type;
    author.textContent = `By ${resource.author}`;
    updated.textContent = `Updated ${formatDate(resource.updated_at)}`;
    actions.className = 'library-resource-actions';
    historyButton.setAttribute('aria-expanded', 'false');
    historyButton.setAttribute('aria-label', `Show release history for ${resource.title}`);

    titleGroup.append(title, id);
    heading.append(titleGroup, badge);
    meta.append(type, author, updated);
    actions.append(historyButton);

    if (resource.status === 'draft') {
        actions.append(makeButton('Edit draft details', 'edit'));
    } else if (resource.status === 'published') {
        actions.append(makeButton(resource.is_featured ? 'Remove featured' : 'Feature resource', 'feature'));
        if (resource.is_featured) {
            actions.append(
                makeButton('Move featured up', 'move-feature-up'),
                makeButton('Move featured down', 'move-feature-down')
            );
        }
        actions.append(makeButton('Retire and hide', 'retire'));
    } else if (resource.status === 'retired') {
        actions.append(makeButton('Restore to library', 'restore'));
    }

    card.append(heading, summary, meta, actions);
    return card;
}

function createDraftEditForm(resource) {
    const form = document.createElement('form');
    const fields = [
        { name: 'title', label: 'Title', value: resource.title, maxLength: 100, minLength: 3 },
        { name: 'summary', label: 'Summary', value: resource.summary, maxLength: 600, minLength: 20, multiline: true },
        { name: 'category', label: 'Category', value: resource.category ?? '', maxLength: 60 },
        { name: 'developer', label: 'Developer or publisher', value: resource.developer ?? '', maxLength: 100 },
        { name: 'tags', label: 'Search tags (comma separated)', value: (resource.tags ?? []).join(', '), maxLength: 500 },
        { name: 'author', label: 'Author', value: resource.author, maxLength: 100, minLength: 2 },
        { name: 'license', label: 'License', value: resource.license, maxLength: 100, minLength: 2 },
        { name: 'support_url', label: 'Support page URL (HTTPS)', value: resource.support_url ?? '', maxLength: 300, type: 'url', required: false },
        { name: 'privacy_policy_url', label: 'Privacy policy URL (HTTPS)', value: resource.privacy_policy_url ?? '', maxLength: 300, type: 'url', required: false },
        { name: 'icon_url', label: 'Icon image URL (HTTPS)', value: resource.icon_url ?? '', maxLength: 500, type: 'url', required: false },
        { name: 'screenshots', label: 'Screenshot image URLs (one per line)', value: (resource.screenshots ?? []).join('\n'), maxLength: 3000, multiline: true, required: false }
    ];
    form.className = 'library-edit-form';

    for (const field of fields) {
        const label = document.createElement('label');
        const control = field.multiline ? document.createElement('textarea') : document.createElement('input');
        label.textContent = field.label;
        control.name = field.name;
        control.required = field.required !== false;
        if (field.type) control.type = field.type;
        if (field.minLength) control.minLength = field.minLength;
        control.maxLength = field.maxLength;
        control.value = field.value;
        if (field.multiline) control.rows = 3;
        label.append(control);
        form.append(label);
    }

    const actions = document.createElement('div');
    const saveButton = document.createElement('button');
    const cancelButton = makeButton('Cancel', 'cancel-edit');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save draft details';
    actions.className = 'library-edit-actions';
    actions.append(saveButton, cancelButton);
    form.append(actions);
    return form;
}

function renderResources() {
    const search = searchInput.value.trim().toLocaleLowerCase();
    const selectedStatus = statusFilter.value;
    const selectedType = typeFilter.value;
    const visibleResources = resources.filter((resource) => {
        const matchesSearch = !search || [
            resource.id,
            resource.title,
            resource.summary,
            resource.author
        ].some((value) => value.toLocaleLowerCase().includes(search));
        const matchesStatus = selectedStatus === 'all' || resource.status === selectedStatus;
        const matchesType = selectedType === 'all' || resource.type === selectedType;
        return matchesSearch && matchesStatus && matchesType;
    });

    const featuredResources = resources.filter((resource) => resource.status === 'published' && resource.is_featured)
        .sort((a, b) => a.featured_order - b.featured_order);
    if (!visibleResources.length) {
        const empty = document.createElement('p');
        empty.className = 'library-empty';
        empty.textContent = resources.length
            ? 'No resources match these filters.'
            : 'No resources are available yet.';
        resourceList.replaceChildren(empty);
        setStatus(listStatus, '');
        return;
    }

    resourceList.replaceChildren(...visibleResources.map(renderResource));
    for (const [index, resource] of featuredResources.entries()) {
        const card = resourceList.querySelector(`[data-resource-id="${CSS.escape(resource.id)}"]`);
        if (!card) continue;
        const moveUp = card.querySelector('[data-action="move-feature-up"]');
        const moveDown = card.querySelector('[data-action="move-feature-down"]');
        if (moveUp) moveUp.disabled = index === 0;
        if (moveDown) moveDown.disabled = index === featuredResources.length - 1;
    }
    setStatus(listStatus, `${visibleResources.length} resource${visibleResources.length === 1 ? '' : 's'} shown.`);
}

async function fetchResources() {
    setStatus(listStatus, 'Loading resources…');
    resourceList.replaceChildren();
    const loadedResources = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('resources')
            .select('*')
            .order('updated_at', { ascending: false })
            .range(offset, offset + pageSize - 1);
        if (error) throw error;
        loadedResources.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
    }

    resources = loadedResources;
    renderResources();
}

function renderHistory(card, releases) {
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    const list = document.createElement('ol');
    section.className = 'library-history';
    section.setAttribute('aria-label', 'Release history');
    heading.textContent = 'Release history';
    list.className = 'library-history-list';
    if (!releases.length) {
        const empty = document.createElement('li');
        empty.className = 'library-empty';
        empty.textContent = 'No releases are recorded for this resource.';
        list.append(empty);
    }

    for (const release of releases) {
        const item = document.createElement('li');
        const summary = document.createElement('span');
        const status = document.createElement('strong');
        const date = document.createElement('time');
        const files = document.createElement('span');
        const format = release.build_format
            ? `Android ${release.build_format.toUpperCase()}`
            : 'Theme or project package';

        item.className = 'library-history-item';
        summary.textContent = `Version ${release.version} · ${format}`;
        status.textContent = release.status;
        const releaseDate = release.published_at ?? release.created_at;
        date.textContent = formatDate(releaseDate);
        const parsedDate = new Date(releaseDate);
        if (releaseDate && !Number.isNaN(parsedDate.getTime())) date.dateTime = parsedDate.toISOString();
        item.append(summary, status, date);

        const fileDetails = [
            release.file_name && `${release.file_name} (${formatBytes(release.file_size)})`,
            release.source_file_name && `Source: ${release.source_file_name} (${formatBytes(release.source_file_size)})`
        ].filter(Boolean);
        if (release.requires) fileDetails.push(`Requirements: ${release.requires}`);
        if (release.supported_wordpress) fileDetails.push(`WordPress: ${release.supported_wordpress}`);
        if (release.requires_php) fileDetails.push(`PHP: ${release.requires_php}`);
        if (fileDetails.length) {
            files.textContent = fileDetails.join(' · ');
            item.append(files);
        }

        if (release.changelog) {
            const changelog = document.createElement('span');
            changelog.textContent = release.changelog;
            item.append(changelog);
        }
        if (release.review_notes) {
            const reviewNotes = document.createElement('span');
            reviewNotes.textContent = `Review feedback: ${release.review_notes}`;
            item.append(reviewNotes);
        }
        list.append(item);
    }

    section.append(heading, list);
    card.querySelector('.library-history')?.remove();
    card.append(section);
}

async function toggleReleaseHistory(button, card) {
    const alreadyOpen = button.getAttribute('aria-expanded') === 'true';
    if (alreadyOpen) {
        card.querySelector('.library-history')?.remove();
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Show release history';
        return;
    }

    button.disabled = true;
    button.textContent = 'Loading history…';
    try {
        const { data, error } = await supabase.from('resource_releases')
            .select('version,changelog,review_notes,build_format,status,published_at,created_at,file_name,file_size,source_file_name,source_file_size,requires,supported_wordpress,requires_php')
            .eq('resource_id', card.dataset.resourceId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        renderHistory(card, data ?? []);
        button.setAttribute('aria-expanded', 'true');
        button.textContent = 'Hide release history';
    } catch (error) {
        console.error('Could not load resource release history.', error);
        setStatus(listStatus, 'Could not load release history. Check staff access and try again.', 'error');
        button.textContent = 'Retry release history';
    } finally {
        button.disabled = false;
    }
}

async function updateAvailability(button, card, targetStatus) {
    const resource = resources.find((item) => item.id === card.dataset.resourceId);
    if (!resource) return;

    const action = targetStatus === 'retired' ? 'retire and hide' : 'restore to the public library';
    if (!window.confirm(`Are you sure you want to ${action} "${resource.title}"?`)) return;

    button.disabled = true;
    try {
        const { error } = await supabase.rpc('set_resource_availability', {
            p_resource_id: resource.id,
            p_status: targetStatus
        });
        if (error) throw error;
        setStatus(listStatus, `Resource "${resource.title}" was ${targetStatus === 'retired' ? 'retired' : 'restored'}.`);
    } catch (error) {
        console.error('Could not change resource publication status.', error);
        setStatus(
            listStatus,
            'Could not change publication status. Apply the latest supabase-schema.sql and verify staff access.',
            'error'
        );
        button.disabled = false;
        return;
    }

    try {
        await fetchResources();
    } catch (error) {
        console.error('Resource status changed, but the manager could not refresh.', error);
        setStatus(listStatus, 'The status change was saved, but the resource list could not refresh. Reload to see the current state.', 'error');
    } finally {
        button.disabled = false;
    }
}

async function loadReleaseReferences() {
    const references = new Set();
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('resource_releases')
            .select('storage_path,source_storage_path')
            .range(offset, offset + pageSize - 1);
        if (error) throw error;
        for (const release of data ?? []) {
            if (release.storage_path) references.add(release.storage_path);
            if (release.source_storage_path) references.add(release.source_storage_path);
        }
        if (!data || data.length < pageSize) break;
    }

    return references;
}

async function listReleaseFiles() {
    const folders = ['resources'];
    const files = [];

    while (folders.length) {
        const folder = folders.shift();
        for (let offset = 0; ; offset += 100) {
            const { data, error } = await supabase.storage.from(releaseBucket)
                .list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
            if (error) throw error;

            for (const entry of data ?? []) {
                const path = `${folder}/${entry.name}`;
                if (entry.id === null) {
                    folders.push(path);
                } else {
                    const size = Number(entry.metadata?.size);
                    if (!Number.isFinite(size) || size < 0) {
                        throw new Error(`Storage metadata is missing a valid file size for ${path}.`);
                    }
                    files.push({ path, size });
                }
            }

            if (!data || data.length < 100) break;
        }
    }

    return files;
}

async function scanStorage() {
    storageScanButton.disabled = true;
    storageCleanupButton.disabled = true;
    storageScan = null;
    storageFileCount.textContent = 'Scanning…';
    storageUsed.textContent = 'Scanning…';
    storageOrphanCount.textContent = 'Scanning…';
    setStatus(storageStatus, 'Scanning storage objects and checking release references…');

    try {
        const [files, references] = await Promise.all([
            listReleaseFiles(),
            loadReleaseReferences()
        ]);
        const orphans = files.filter((file) =>
            orphanPathPattern.test(file.path) && !references.has(file.path)
        );
        const bytesUsed = files.reduce((total, file) => total + file.size, 0);

        storageScan = { files, orphans };
        storageFileCount.textContent = String(files.length);
        storageUsed.textContent = formatBytes(bytesUsed);
        storageOrphanCount.textContent = String(orphans.length);
        storageCleanupButton.disabled = orphans.length === 0;
        setStatus(
            storageStatus,
            orphans.length
                ? `Scan complete. ${orphans.length} unreferenced release file${orphans.length === 1 ? '' : 's'} can be reviewed for cleanup.`
                : 'Scan complete. No unreferenced release files were found.'
        );
    } catch (error) {
        console.error('Could not scan release storage.', error);
        storageFileCount.textContent = 'Unavailable';
        storageUsed.textContent = 'Unavailable';
        storageOrphanCount.textContent = 'Unavailable';
        setStatus(storageStatus, 'Storage scan failed. Check storage access and try again.', 'error');
    } finally {
        storageScanButton.disabled = false;
    }
}

async function removeOrphanFiles() {
    if (!storageScan?.orphans.length) return;
    const paths = storageScan.orphans.map((file) => file.path);
    if (!window.confirm(`Remove ${paths.length} unreferenced release file${paths.length === 1 ? '' : 's'}? This cannot be undone.`)) {
        return;
    }

    storageCleanupButton.disabled = true;
    storageScanButton.disabled = true;
    setStatus(storageStatus, `Removing ${paths.length} unreferenced file${paths.length === 1 ? '' : 's'}…`);
    let removalCompleted = false;
    try {
        for (let offset = 0; offset < paths.length; offset += 100) {
            const { error } = await supabase.storage.from(releaseBucket).remove(paths.slice(offset, offset + 100));
            if (error) throw error;
        }
        removalCompleted = true;
        const { error: activityError } = await supabase.rpc('record_storage_cleanup', {
            p_file_count: paths.length
        });
        if (activityError) throw activityError;
        setStatus(storageStatus, 'Cleanup finished. Scanning storage again…');
        await scanStorage();
    } catch (error) {
        console.error('Could not remove all unreferenced release files.', error);
        setStatus(
            storageStatus,
            removalCompleted
                ? 'Files were removed, but the cleanup could not be recorded in the activity log. Scan storage again and report this to an administrator.'
                : 'Cleanup did not complete. Some files may have been removed; scan storage again to confirm.',
            'error'
        );
        storageCleanupButton.disabled = true;
        storageScanButton.disabled = false;
        storageScan = null;
    }
}

async function toggleFeatured(button, card) {
    const resource = resources.find((item) => item.id === card.dataset.resourceId);
    if (!resource || resource.status !== 'published') return;
    button.disabled = true;

    try {
        const { error } = await supabase.rpc('set_resource_featured', {
            p_resource_id: resource.id,
            p_featured: !resource.is_featured
        });
        if (error) throw error;
        setStatus(listStatus, `"${resource.title}" ${resource.is_featured ? 'was removed from' : 'is now in'} featured resources.`);
    } catch (error) {
        console.error('Could not change resource featured status.', error);
        setStatus(listStatus, 'Could not update featured status. Apply the latest supabase-schema.sql and verify staff access.', 'error');
        button.disabled = false;
        return;
    }

    try {
        await fetchResources();
    } catch (error) {
        console.error('Featured status changed, but the resource list could not refresh.', error);
        setStatus(listStatus, 'Featured status was saved, but the resource list could not refresh. Reload to see the change.', 'error');
    } finally {
        button.disabled = false;
    }
}

async function moveFeaturedResource(button, card, direction) {
    const resource = resources.find((item) => item.id === card.dataset.resourceId);
    if (!resource?.is_featured) return;
    button.disabled = true;

    try {
        const { error } = await supabase.rpc('move_featured_resource', {
            p_resource_id: resource.id,
            p_direction: direction
        });
        if (error) throw error;
        setStatus(listStatus, `Featured order updated for "${resource.title}".`);
    } catch (error) {
        console.error('Could not reorder featured resources.', error);
        setStatus(listStatus, 'Could not reorder featured resources. Apply the latest supabase-schema.sql and verify staff access.', 'error');
        button.disabled = false;
        return;
    }

    try {
        await fetchResources();
    } catch (error) {
        console.error('Featured order changed, but the resource list could not refresh.', error);
        setStatus(listStatus, 'Featured order was saved, but the list could not refresh. Reload to see the new order.', 'error');
    } finally {
        button.disabled = false;
    }
}

async function saveDraftEdit(form, card) {
    const resource = resources.find((item) => item.id === card.dataset.resourceId);
    if (!resource || resource.status !== 'draft') return;

    const submitButton = form.querySelector('button[type="submit"]');
    const parseTags = (value) => [...new Set(value.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))];
    const parseScreenshots = (value) => [...new Set(value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))];
    const tags = parseTags(form.elements.tags.value);
    const screenshots = parseScreenshots(form.elements.screenshots.value);
    if (tags.length > 12 || tags.some((tag) => tag.length > 40 || !/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(tag))) {
        setStatus(listStatus, 'Use up to 12 search tags; each tag must be 1–40 letters, numbers, spaces, or hyphens.', 'error');
        return;
    }
    if (screenshots.length > 6) {
        setStatus(listStatus, 'Add no more than 6 screenshot URLs.', 'error');
        return;
    }
    const secureUrls = [
        ['Support page', form.elements.support_url.value.trim()],
        ['Privacy policy', form.elements.privacy_policy_url.value.trim()],
        ['Icon image', form.elements.icon_url.value.trim()],
        ...screenshots.map((url, index) => [`Screenshot ${index + 1}`, url])
    ];
    const invalidUrl = secureUrls.find(([, url]) => {
        if (!url) return false;
        try {
            return new URL(url).protocol !== 'https:';
        } catch {
            return true;
        }
    });
    if (invalidUrl) {
        setStatus(listStatus, `${invalidUrl[0]} URLs must be valid HTTPS links.`, 'error');
        return;
    }
    submitButton.disabled = true;
    try {
        const { data, error } = await supabase.from('resources')
            .update({
                title: form.elements.title.value.trim(),
                summary: form.elements.summary.value.trim(),
                category: form.elements.category.value.trim(),
                tags,
                developer: form.elements.developer.value.trim(),
                author: form.elements.author.value.trim(),
                license: form.elements.license.value.trim(),
                support_url: form.elements.support_url.value.trim(),
                privacy_policy_url: form.elements.privacy_policy_url.value.trim(),
                icon_url: form.elements.icon_url.value.trim(),
                screenshots
            })
            .eq('id', resource.id)
            .eq('status', 'draft')
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Draft was not updated. It may no longer be editable.');
        setStatus(listStatus, `Draft "${resource.id}" was updated.`);
    } catch (error) {
        console.error('Could not update draft resource details.', error);
        setStatus(listStatus, 'Could not update this draft. Verify that it is still a draft and try again.', 'error');
        submitButton.disabled = false;
        return;
    }

    try {
        await fetchResources();
    } catch (error) {
        console.error('Draft details were saved, but the manager could not refresh.', error);
        setStatus(listStatus, 'Draft details were saved, but the resource list could not refresh. Reload to see the changes.', 'error');
    } finally {
        submitButton.disabled = false;
    }
}

function onResourceListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.library-resource-card');
    if (!card) return;

    if (button.dataset.action === 'history') {
        toggleReleaseHistory(button, card);
    } else if (button.dataset.action === 'edit') {
        card.querySelector('.library-edit-form')?.remove();
        card.append(createDraftEditForm(resources.find((item) => item.id === card.dataset.resourceId)));
        card.querySelector('.library-edit-form input')?.focus();
    } else if (button.dataset.action === 'cancel-edit') {
        button.closest('.library-edit-form')?.remove();
    } else if (button.dataset.action === 'retire') {
        updateAvailability(button, card, 'retired');
    } else if (button.dataset.action === 'restore') {
        updateAvailability(button, card, 'published');
    } else if (button.dataset.action === 'feature') {
        toggleFeatured(button, card);
    } else if (button.dataset.action === 'move-feature-up') {
        moveFeaturedResource(button, card, -1);
    } else if (button.dataset.action === 'move-feature-down') {
        moveFeaturedResource(button, card, 1);
    }
}

function onEditSubmit(event) {
    const form = event.target.closest('.library-edit-form');
    if (!form) return;
    event.preventDefault();
    const card = form.closest('.library-resource-card');
    if (card) saveDraftEdit(form, card);
}

if (
    !listStatus || !resourceList || !searchInput || !statusFilter || !typeFilter
    || !storageScanButton || !storageCleanupButton || !storageFileCount
    || !storageUsed || !storageOrphanCount || !storageStatus
) {
    console.error('The resource manager is missing required page elements.');
} else if (!supabase) {
    setStatus(listStatus, 'Supabase is not configured, so resources cannot be loaded.', 'error');
} else {
    searchInput.addEventListener('input', renderResources);
    statusFilter.addEventListener('change', renderResources);
    typeFilter.addEventListener('change', renderResources);
    resourceList.addEventListener('click', onResourceListClick);
    resourceList.addEventListener('submit', onEditSubmit);
    storageScanButton.addEventListener('click', scanStorage);
    storageCleanupButton.addEventListener('click', removeOrphanFiles);

    onAuthStateChanged(async (user) => {
        if (!user) {
            setStatus(listStatus, 'Sign in with a staff account to manage resources.');
            return;
        }

        try {
            if (!await userIsStaff()) {
                setStatus(listStatus, 'This account is not authorized to manage resources.', 'error');
                return;
            }
            await fetchResources();
        } catch (error) {
            console.error('Could not load the staff resource manager.', error);
            setStatus(listStatus, 'Resources could not be loaded. Check staff access and database availability.', 'error');
        }
    }, (error) => {
        console.error('Could not check resource manager access.', error);
        setStatus(listStatus, 'Account access could not be checked. Reload and try again.', 'error');
    });
}
