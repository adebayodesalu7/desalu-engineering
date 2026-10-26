import { supabase } from './supabase-client.js';
import { onAuthStateChanged, userIsStaff } from './supabase-auth.js';

const releasesList = document.querySelector('#review-release-list');
const releaseStatus = document.querySelector('#review-release-status');
const reportsList = document.querySelector('#review-report-list');
const reportStatus = document.querySelector('#review-report-status');
const activityList = document.querySelector('#review-activity-list');
const activityStatus = document.querySelector('#review-activity-status');

function setStatus(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Date unavailable'
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function createButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    return button;
}

function createReleaseCard(release, resource) {
    const card = document.createElement('article');
    const header = document.createElement('div');
    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    const version = document.createElement('span');
    const summary = document.createElement('p');
    const metadata = document.createElement('dl');
    const files = document.createElement('p');
    const notes = document.createElement('p');
    const actions = document.createElement('div');

    card.className = 'review-queue-card';
    card.dataset.releaseId = release.id;
    card.dataset.resourceId = release.resource_id;
    header.className = 'library-resource-card-heading';
    title.textContent = resource.title;
    version.className = 'library-status-badge';
    version.textContent = `Version ${release.version} · submitted ${formatDate(release.created_at)}`;
    summary.className = 'library-resource-summary';
    summary.textContent = resource.summary;
    metadata.className = 'review-release-metadata';

    for (const [label, value] of [
        ['Platform', resource.type],
        ['License', resource.license],
        ['Requirements', release.requires || 'Not specified'],
        ['Release notes', release.changelog || 'No changelog provided'],
        ['Setup', release.setup]
    ]) {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        const detail = document.createElement('dd');
        term.textContent = label;
        detail.textContent = value;
        item.append(term, detail);
        metadata.append(item);
    }

    const artifactLabel = release.build_format
        ? `Android ${release.build_format.toUpperCase()}`
        : 'Project ZIP';
    const filesText = [
        `${artifactLabel}: ${release.file_name} (${formatBytes(Number(release.file_size))})`,
        release.source_file_name
            ? `Source: ${release.source_file_name} (${formatBytes(Number(release.source_file_size))})`
            : ''
    ].filter(Boolean).join(' · ');
    files.className = 'review-file-details';
    files.textContent = filesText;
    actions.className = 'library-resource-actions';
    actions.append(createButton('Approve and publish', 'approve'), createButton('Reject with feedback', 'reject'));

    titleGroup.append(title, version);
    header.append(titleGroup);
    card.append(header, summary, metadata, files);
    if (release.review_notes) {
        notes.className = 'review-feedback';
        notes.textContent = `Previous review notes: ${release.review_notes}`;
        card.append(notes);
    }
    card.append(actions);
    return card;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'size unavailable';
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

async function loadReleaseQueue() {
    setStatus(releaseStatus, 'Loading release queue…');
    releasesList.replaceChildren();
    const { data: releases, error } = await supabase.from('resource_releases')
        .select('id,resource_id,version,requires,setup,changelog,build_format,file_name,file_size,source_file_name,source_file_size,review_notes,created_at')
        .eq('status', 'in_review')
        .order('created_at', { ascending: true })
        .limit(100);
    if (error) throw error;
    if (!releases?.length) {
        setStatus(releaseStatus, 'No releases are awaiting review.');
        return;
    }

    const { data: resources, error: resourcesError } = await supabase.from('resources')
        .select('id,title,summary,type,license')
        .in('id', [...new Set(releases.map((release) => release.resource_id))]);
    if (resourcesError) throw resourcesError;
    const resourceMap = new Map((resources ?? []).map((resource) => [resource.id, resource]));
    const cards = releases.map((release) => {
        const resource = resourceMap.get(release.resource_id);
        if (!resource) throw new Error(`Resource metadata missing for release ${release.id}.`);
        return createReleaseCard(release, resource);
    });
    releasesList.replaceChildren(...cards);
    setStatus(releaseStatus, `${releases.length} release${releases.length === 1 ? '' : 's'} awaiting review.`);
}

function createReportCard(report, resource) {
    const card = document.createElement('article');
    const header = document.createElement('div');
    const title = document.createElement('h3');
    const status = document.createElement('span');
    const message = document.createElement('p');
    const actions = document.createElement('div');
    card.className = 'review-queue-card';
    card.dataset.reportId = report.id;
    title.textContent = resource?.title ?? report.resource_id;
    status.className = 'library-status-badge';
    status.textContent = `${report.reason} · ${formatDate(report.created_at)}`;
    message.className = 'library-resource-summary';
    message.textContent = report.message;
    header.className = 'library-resource-card-heading';
    header.append(title, status);
    actions.className = 'library-resource-actions';
    actions.append(createButton('Resolve report', 'resolve-report'), createButton('Dismiss report', 'dismiss-report'));
    card.append(header, message, actions);
    return card;
}

async function loadReports() {
    setStatus(reportStatus, 'Loading resource reports…');
    reportsList.replaceChildren();
    const { data: reports, error } = await supabase.from('resource_reports')
        .select('id,resource_id,reason,message,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100);
    if (error) throw error;
    if (!reports?.length) {
        setStatus(reportStatus, 'No pending resource reports.');
        return;
    }

    const { data: resources, error: resourcesError } = await supabase.from('resources')
        .select('id,title')
        .in('id', [...new Set(reports.map((report) => report.resource_id))]);
    if (resourcesError) throw resourcesError;
    const resourceMap = new Map((resources ?? []).map((resource) => [resource.id, resource]));
    reportsList.replaceChildren(...reports.map((report) => createReportCard(report, resourceMap.get(report.resource_id))));
    setStatus(reportStatus, `${reports.length} pending report${reports.length === 1 ? '' : 's'}.`);
}

async function loadActivity() {
    setStatus(activityStatus, 'Loading activity…');
    activityList.replaceChildren();
    const { data, error } = await supabase.from('admin_activity_log')
        .select('action,resource_id,release_id,details,created_at')
        .order('created_at', { ascending: false })
        .limit(25);
    if (error) throw error;
    if (!data?.length) {
        setStatus(activityStatus, 'No recorded admin activity yet.');
        return;
    }

    for (const entry of data) {
        const item = document.createElement('li');
        const copy = document.createElement('div');
        const action = document.createElement('strong');
        const target = document.createElement('span');
        const time = document.createElement('time');
        item.className = 'dashboard-activity-item';
        copy.className = 'dashboard-activity-copy';
        action.textContent = entry.action.replaceAll('-', ' ');
        target.textContent = [entry.resource_id, entry.release_id].filter(Boolean).join(' · ') || 'Workspace';
        time.textContent = formatDate(entry.created_at);
        copy.append(action, target);
        item.append(copy, time);
        activityList.append(item);
    }
    setStatus(activityStatus, `${data.length} recent activity entries.`);
}

async function runReviewAction(button, card, action) {
    const resourceId = card.dataset.resourceId;
    const releaseId = card.dataset.releaseId;
    if (action === 'approve' && !window.confirm('Approve this release and make it visible in the public library?')) return;

    let reviewNotes = '';
    if (action === 'reject') {
        reviewNotes = window.prompt('Explain what needs to be corrected before resubmission:')?.trim() ?? '';
        if (reviewNotes.length < 10 || reviewNotes.length > 2000) {
            setStatus(releaseStatus, 'Rejection feedback must be between 10 and 2,000 characters. The release remains in the review queue.', 'error');
            return;
        }
    }

    button.disabled = true;
    try {
        const { error } = action === 'approve'
            ? await supabase.rpc('publish_resource_release', { p_resource_id: resourceId, p_release_id: releaseId })
            : await supabase.rpc('reject_resource_release', {
                p_resource_id: resourceId,
                p_release_id: releaseId,
                p_review_notes: reviewNotes
            });
        if (error) throw error;
        setStatus(
            releaseStatus,
            action === 'approve'
                ? 'Release approved and published.'
                : 'Release rejected with feedback. Submit the corrected package as a new version after addressing the notes.'
        );
        await loadReleaseQueue();
        await loadActivity();
    } catch (error) {
        console.error('Could not complete release review.', error);
        setStatus(releaseStatus, 'Review action failed. Check the database schema and staff access, then reload.', 'error');
        button.disabled = false;
    }
}

async function runReportAction(button, card, status) {
    const staffNote = window.prompt('Optional private staff note:')?.trim() ?? '';
    button.disabled = true;
    try {
        const { error } = await supabase.rpc('review_resource_report', {
            p_report_id: card.dataset.reportId,
            p_status: status,
            p_staff_note: staffNote
        });
        if (error) throw error;
        setStatus(reportStatus, `Report ${status}.`);
        await loadReports();
        await loadActivity();
    } catch (error) {
        console.error('Could not review resource report.', error);
        setStatus(reportStatus, 'Report review failed. Check the database schema and staff access, then reload.', 'error');
        button.disabled = false;
    }
}

releasesList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    const card = button?.closest('.review-queue-card');
    if (!button || !card) return;
    if (button.dataset.action === 'approve') runReviewAction(button, card, 'approve');
    if (button.dataset.action === 'reject') runReviewAction(button, card, 'reject');
});

reportsList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    const card = button?.closest('.review-queue-card');
    if (!button || !card) return;
    if (button.dataset.action === 'resolve-report') runReportAction(button, card, 'resolved');
    if (button.dataset.action === 'dismiss-report') runReportAction(button, card, 'dismissed');
});

if (!releasesList || !releaseStatus || !reportsList || !reportStatus || !activityList || !activityStatus) {
    console.error('The review dashboard is missing required page elements.');
} else if (!supabase) {
    setStatus(releaseStatus, 'Supabase is not configured, so the review queue cannot load.', 'error');
} else {
    onAuthStateChanged(async (user) => {
        if (!user) {
            setStatus(releaseStatus, 'Sign in with a staff account to open the review queue.');
            return;
        }
        try {
            if (!await userIsStaff()) {
                setStatus(releaseStatus, 'This account is not authorized to use the review queue.', 'error');
                return;
            }

            const results = await Promise.allSettled([loadReleaseQueue(), loadReports(), loadActivity()]);
            const failures = results.filter((result) => result.status === 'rejected');
            if (failures.length) {
                for (const failure of failures) console.error('A review dashboard panel failed to load.', failure.reason);
                if (results[0].status === 'rejected') setStatus(releaseStatus, 'Release queue could not load. Apply the updated schema and check staff access.', 'error');
                if (results[1].status === 'rejected') setStatus(reportStatus, 'Resource reports could not load. Apply the updated schema and check staff access.', 'error');
                if (results[2].status === 'rejected') setStatus(activityStatus, 'Admin activity could not load. Apply the updated schema and check staff access.', 'error');
            }
        } catch (error) {
            console.error('Could not verify review dashboard staff access.', error);
            setStatus(releaseStatus, 'Staff access could not be verified. Check your role and reload.', 'error');
        }
    }, (error) => {
        console.error('Could not check review dashboard account access.', error);
        setStatus(releaseStatus, 'Account access could not be checked. Reload and try again.', 'error');
    });
}
