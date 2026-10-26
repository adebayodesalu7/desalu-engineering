import { supabase } from './supabase-client.js';
import { onAuthStateChanged, userIsStaff } from './supabase-auth.js';

const form = document.querySelector('#resource-publish-form');
const accessStatus = document.querySelector('#publish-access-status');
const publishStatus = document.querySelector('#resource-publish-status');
const signInLink = document.querySelector('#resource-admin-signin');
const publishButton = document.querySelector('#publish-resource-button');
const platform = new URLSearchParams(window.location.search).get('platform');
const platformConfig = {
    wordpress: {
        title: 'Publish a WordPress release',
        intro: 'Publish a reviewed, installable theme or plugin ZIP with its compatibility details.',
        attestation: 'I verified the right to redistribute this package and its assets, checked for secrets and client data, reviewed the archive, and tested it on a clean compatible WordPress installation.'
    },
    android: {
        title: 'Publish an Android app release',
        intro: 'Publish an APK or AAB build and a separate source project ZIP. Each file is available as its own library download.',
        type: 'android-app',
        attestation: 'I verified the rights to distribute the app and source, checked both files for secrets and client data, reviewed the build, and tested the app on a compatible Android device or emulator.'
    },
    ios: {
        title: 'Publish an iOS app release',
        intro: 'Publish an Xcode source project ZIP with its supported platform and setup details.',
        type: 'ios-app',
        attestation: 'I verified the rights to distribute this source project and its assets, checked it for signing secrets and client data, reviewed the archive, and tested it with a compatible Xcode setup.'
    },
    web: {
        title: 'Publish an HTML / CSS / JS release',
        intro: 'Publish a reviewed web project ZIP with runtime requirements and setup notes.',
        type: 'html-css',
        attestation: 'I verified the right to redistribute this project and its assets, checked the archive for secrets and client data, and tested the documented setup.'
    }
}[platform];
const bucketName = 'resource-releases';
const maxPackageBytes = 50 * 1024 * 1024;

if (form && accessStatus && publishStatus && signInLink && publishButton) {
    function setStatus(element, message, kind = '') {
        element.textContent = message;
        element.dataset.kind = kind;
    }

    function value(name) {
        return form.elements[name].value.trim();
    }

    function parseTags(rawValue) {
        return [...new Set(rawValue.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))];
    }

    function parseScreenshots(rawValue) {
        return [...new Set(rawValue.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))];
    }

    function setPlatformFields() {
        form.querySelectorAll('[data-platform-field]').forEach((field) => {
            const kind = field.dataset.platformField;
            const visible = kind === 'wordpress'
                ? platform === 'wordpress'
                : kind === 'android'
                    ? platform === 'android'
                    : platform !== 'android';
            field.hidden = !visible;
            field.querySelectorAll('input,select,textarea').forEach((control) => {
                control.disabled = !visible;
            });
        });
    }

    function setResourceType() {
        const resourceType = platform === 'wordpress'
            ? form.querySelector('#wordpress-resource-type').value
            : platformConfig?.type;
        form.elements.type.value = resourceType ?? '';
    }

    function hexDigest(buffer) {
        return [...new Uint8Array(buffer)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    async function isZip(file) {
        const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        return signature.length === 4
            && signature[0] === 0x50
            && signature[1] === 0x4b
            && [0x03, 0x05, 0x07].includes(signature[2])
            && [0x04, 0x06, 0x08].includes(signature[3]);
    }

    function setFormBusy(isBusy) {
        publishButton.disabled = isBusy;
        form.querySelectorAll('input,select,textarea').forEach((control) => {
            const platformField = control.closest('[data-platform-field]');
            control.disabled = isBusy || Boolean(platformField?.hidden);
        });
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB'];
        let size = bytes;
        let unit = -1;
        do {
            size /= 1024;
            unit += 1;
        } while (size >= 1024 && unit < units.length - 1);
        return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
    }

    function updateReleasePreview() {
        const title = value('title') || 'Your resource title';
        const resourceId = value('resourceId') || 'Resource ID';
        const version = value('version') || 'Version pending';
        document.querySelector('#release-preview-name').textContent = title;
        document.querySelector('#release-preview-version').textContent = `${resourceId} · ${version}`;
        document.querySelector('#release-preview-summary').textContent
            = value('summary') || 'Your short description will appear here.';

        const platformLabels = {
            wordpress: 'WordPress theme or plugin',
            android: `Android ${value('androidBuildFormat').toUpperCase()}`,
            ios: 'iOS source project',
            web: 'HTML / CSS / JS project'
        };
        document.querySelector('#release-preview-platform').textContent
            = platformLabels[platform] ?? 'Selected publishing workflow';

        const requirements = [
            value('requires'),
            value('supportedWordPress') && `WordPress ${value('supportedWordPress')}`,
            value('requiresPHP') && `PHP ${value('requiresPHP')}`
        ].filter(Boolean);
        document.querySelector('#release-preview-requirements').textContent
            = requirements.join(' · ') || 'Not specified';

        const fileInputs = platform === 'android'
            ? [form.querySelector('[name="androidBuild"]'), form.querySelector('[name="sourcePackage"]')]
            : [form.querySelector('[name="package"]')];
        const selectedFiles = fileInputs.flatMap((input) => [...(input?.files ?? [])]);
        document.querySelector('#release-preview-files').textContent = selectedFiles.length
            ? selectedFiles.map((file) => `${file.name} (${formatFileSize(file.size)})`).join(' · ')
            : 'No files selected';
    }

    function updatePublishingGuideLink() {
        const guideTarget = platform === 'wordpress'
            ? form.querySelector('#wordpress-resource-type').value
            : platform;
        document.querySelector('#release-publishing-guide').href = `publishing-guide.html#${guideTarget}`;
    }

    async function cleanupDraft(resourceId, releaseId, paths, resourceCreated) {
        if (!supabase) return;
        const uploadedPaths = paths.filter(Boolean);
        if (uploadedPaths.length) {
            const { error } = await supabase.storage.from(bucketName).remove(uploadedPaths);
            if (error) console.error('Could not clean up failed release uploads.', error);
        }
        const { error: releaseError } = await supabase
            .from('resource_releases')
            .delete()
            .eq('id', releaseId)
            .eq('status', 'draft');
        if (releaseError) console.error('Could not remove the failed release draft.', releaseError);

        if (resourceCreated) {
            const { error: resourceError } = await supabase
                .from('resources')
                .delete()
                .eq('id', resourceId)
                .eq('status', 'draft');
            if (resourceError) console.error('Could not remove the empty resource draft.', resourceError);
        }
    }

    async function publishRelease() {
        if (!supabase) {
            setStatus(publishStatus, 'Supabase Auth, Database, and Storage must be configured before publishing.', 'error');
            return;
        }
        if (!platformConfig) {
            setStatus(publishStatus, 'Choose a valid publishing dashboard before continuing.', 'error');
            return;
        }
        if (!form.reportValidity()) return;

        setResourceType();
        const resourceType = value('type');
        const android = platform === 'android';
        const packageFile = android ? form.elements.androidBuild.files[0] : form.elements.package.files[0];
        const sourceFile = android ? form.elements.sourcePackage.files[0] : null;
        const buildFormat = android ? value('androidBuildFormat') : '';

        for (const file of [packageFile, sourceFile].filter(Boolean)) {
            if (file.size < 1 || file.size > maxPackageBytes) {
                setStatus(publishStatus, 'Each release file must be between 1 byte and 50 MB.', 'error');
                return;
            }
        }
        if (android) {
            if (!['apk', 'aab'].includes(buildFormat)
                || !packageFile.name.toLowerCase().endsWith(`.${buildFormat}`)
                || !await isZip(packageFile)) {
                setStatus(publishStatus, 'Choose a valid APK or AAB file matching the selected build format.', 'error');
                return;
            }
            if (!sourceFile.name.toLowerCase().endsWith('.zip') || !await isZip(sourceFile)) {
                setStatus(publishStatus, 'The source project file is not a valid ZIP archive.', 'error');
                return;
            }
        } else if (!packageFile.name.toLowerCase().endsWith('.zip') || !await isZip(packageFile)) {
            setStatus(publishStatus, 'The selected file is not a valid ZIP archive.', 'error');
            return;
        }

        const resourceId = value('resourceId');
        const version = value('version');
        const tags = parseTags(value('tags'));
        const screenshots = parseScreenshots(value('screenshots'));
        const secureUrls = [
            ['Support page', value('supportUrl')],
            ['Privacy policy', value('privacyPolicyUrl')],
            ['Icon image', value('iconUrl')],
            ...screenshots.map((url, index) => [`Screenshot ${index + 1}`, url])
        ];
        if (tags.length > 12 || tags.some((tag) => tag.length > 40 || !/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u.test(tag))) {
            setStatus(publishStatus, 'Use up to 12 search tags; each tag must be 1–40 letters, numbers, spaces, or hyphens.', 'error');
            return;
        }
        if (screenshots.length > 6) {
            setStatus(publishStatus, 'Add no more than 6 screenshot URLs.', 'error');
            return;
        }
        const invalidUrl = secureUrls.find(([, url]) => {
            if (!url) return false;
            try {
                return new URL(url).protocol !== 'https:';
            } catch {
                return true;
            }
        });
        if (invalidUrl) {
            setStatus(publishStatus, `${invalidUrl[0]} URLs must be valid HTTPS links.`, 'error');
            return;
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(resourceId)) {
            setStatus(publishStatus, 'Resource ID must use lowercase letters, numbers, and hyphens.', 'error');
            return;
        }
        if (!/^[A-Za-z0-9.+_-]+$/.test(version)) {
            setStatus(publishStatus, 'Use a simple release version such as 1.2.2.', 'error');
            return;
        }

        setFormBusy(true);
        let releaseId = '';
        let resourceCreated = false;
        const uploadedPaths = [];
        setStatus(publishStatus, 'Checking the release files and preparing a draft…');
        try {
            const [checksum, sourceChecksum] = await Promise.all([
                crypto.subtle.digest('SHA-256', await packageFile.arrayBuffer()).then(hexDigest),
                sourceFile
                    ? crypto.subtle.digest('SHA-256', await sourceFile.arrayBuffer()).then(hexDigest)
                    : Promise.resolve('')
            ]);
            const { data: resourceData, error: lookupError } = await supabase
                .from('resources')
                .select('id,type,status')
                .eq('id', resourceId)
                .maybeSingle();
            if (lookupError) throw lookupError;
            if (resourceData?.status === 'retired') {
                throw new Error('This resource is retired. Create a new resource ID to publish a new product.');
            }
            if (resourceData && resourceData.type !== resourceType) {
                throw new Error('The resource type cannot change between releases.');
            }

            if (!resourceData) {
                const { error } = await supabase.from('resources').insert({
                    id: resourceId,
                    title: value('title'),
                    summary: value('summary'),
                    category: value('category'),
                    tags,
                    developer: value('developer'),
                    support_url: value('supportUrl'),
                    privacy_policy_url: value('privacyPolicyUrl'),
                    icon_url: value('iconUrl'),
                    screenshots,
                    type: resourceType,
                    author: value('author'),
                    license: value('license'),
                    status: 'draft'
                });
                if (error) throw error;
                resourceCreated = true;
            }

            releaseId = crypto.randomUUID();
            const releasePath = `resources/${resourceId}/releases/${releaseId}`;
            const storagePath = android
                ? `${releasePath}/build.${buildFormat}`
                : `${releasePath}/artifact.zip`;
            const sourceStoragePath = sourceFile ? `${releasePath}/source.zip` : '';
            const { error: releaseError } = await supabase.from('resource_releases').insert({
                id: releaseId,
                resource_id: resourceId,
                version,
                supported_wordpress: value('supportedWordPress'),
                requires_php: value('requiresPHP'),
                requires: value('requires'),
                setup: value('setup'),
                changelog: value('changelog'),
                storage_path: storagePath,
                file_name: packageFile.name,
                file_size: packageFile.size,
                sha256: checksum,
                build_format: buildFormat,
                source_storage_path: sourceStoragePath,
                source_file_name: sourceFile?.name ?? '',
                source_file_size: sourceFile?.size ?? 0,
                source_sha256: sourceChecksum,
                status: 'draft'
            });
            if (releaseError) throw releaseError;

            setStatus(publishStatus, 'Uploading the release files…');
            const buildUpload = await supabase.storage.from(bucketName).upload(storagePath, packageFile, {
                contentType: android
                    ? buildFormat === 'apk' ? 'application/vnd.android.package-archive' : 'application/octet-stream'
                    : 'application/zip',
                upsert: false,
                metadata: { sha256: checksum }
            });
            if (buildUpload.error) throw buildUpload.error;
            uploadedPaths.push(storagePath);

            if (sourceFile) {
                const sourceUpload = await supabase.storage.from(bucketName).upload(sourceStoragePath, sourceFile, {
                    contentType: 'application/zip',
                    upsert: false,
                    metadata: { sha256: sourceChecksum }
                });
                if (sourceUpload.error) throw sourceUpload.error;
                uploadedPaths.push(sourceStoragePath);
            }

            setStatus(publishStatus, 'Submitting the verified release for staff review…');
            const { error: submitError } = await supabase.rpc('submit_resource_release_for_review', {
                p_resource_id: resourceId,
                p_release_id: releaseId
            });
            if (submitError) throw submitError;

            setStatus(publishStatus, `Release ${version} was submitted for staff review. It will appear in the public library after approval.`);
            form.reset();
            form.elements.license.value = platform === 'wordpress' ? 'GPL-2.0-or-later' : '';
            setResourceType();
            updateReleasePreview();
        } catch (error) {
            console.error('Could not publish the resource release.', error);
            if (releaseId) {
                try {
                    await cleanupDraft(resourceId, releaseId, uploadedPaths, resourceCreated);
                } catch (cleanupError) {
                    console.error('Release cleanup failed after a publishing error.', cleanupError);
                }
            }
            setStatus(publishStatus, error.message || 'The release could not be published. Check the connection and try again.', 'error');
        } finally {
            setFormBusy(false);
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!supabase?.auth.getSession) {
            setStatus(publishStatus, 'Supabase is not configured. Please try again later.', 'error');
            return;
        }
        void supabase.auth.getSession().then(({ data, error }) => {
            if (error) throw error;
            if (!data.session) {
                setStatus(publishStatus, 'Sign in with a staff account before publishing.', 'error');
                return;
            }
            void publishRelease();
        }).catch((error) => {
            console.error('Could not verify the publishing account.', error);
            setStatus(publishStatus, 'Could not verify the publishing account. Reload and try again.', 'error');
        });
    });

    if (platformConfig) {
        document.querySelector('#resource-admin-title').textContent = platformConfig.title;
        document.querySelector('#publish-intro').textContent = platformConfig.intro;
        document.querySelector('#review-attestation-copy').textContent = platformConfig.attestation;
        document.querySelector('#requirements-label').textContent = platform === 'wordpress'
            ? 'Other requirements'
            : 'Platform and runtime requirements';
        form.elements.license.value = platform === 'wordpress' ? 'GPL-2.0-or-later' : '';
        form.elements.resourceId.placeholder = platform === 'android'
            ? 'my-android-app'
            : platform === 'ios'
                ? 'my-ios-app'
                : platform === 'web'
                    ? 'my-web-project'
                    : 'my-wordpress-theme';
        setPlatformFields();
        setResourceType();
        updatePublishingGuideLink();
        form.addEventListener('input', updateReleasePreview);
        form.addEventListener('change', updateReleasePreview);
        updateReleasePreview();
        form.querySelector('#wordpress-resource-type').addEventListener('change', () => {
            setResourceType();
            updatePublishingGuideLink();
        });
    } else {
        setStatus(accessStatus, 'Choose a valid publishing dashboard before continuing.', 'error');
    }

    if (!supabase) {
        setStatus(accessStatus, 'Supabase account services are not configured.', 'error');
    } else {
        onAuthStateChanged(async (user) => {
            signInLink.hidden = Boolean(user);
            form.hidden = true;
            if (!platformConfig) return;
            if (!user) {
                setStatus(accessStatus, 'Sign in with a staff account to publish releases.');
                return;
            }

            setStatus(accessStatus, 'Verifying staff access…');
            try {
                if (!await userIsStaff()) {
                    setStatus(accessStatus, 'This account is signed in but is not authorized to publish releases.', 'error');
                    return;
                }
                form.hidden = false;
                setStatus(accessStatus, `Staff access confirmed for ${user.email ?? 'your account'}.`);
            } catch (error) {
                console.error('Could not verify release-publisher staff access.', error);
                setStatus(accessStatus, 'Staff access could not be verified. Check the Supabase staff role and try again.', 'error');
            }
        }, (error) => {
            console.error('Could not check the release publisher account.', error);
            setStatus(accessStatus, 'Account access could not be checked. Reload and try again.', 'error');
        });
    }
}
