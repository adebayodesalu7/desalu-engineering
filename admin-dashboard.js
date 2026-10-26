import { supabase } from './supabase-client.js';
import { onAuthStateChanged, userIsStaff } from './supabase-auth.js';

const dashboard = document.querySelector('#staff-dashboard-content');
const dashboardStatus = document.querySelector('#admin-dashboard-status');
const gate = document.querySelector('#admin-dashboard-gate');
const gateStatus = document.querySelector('#admin-dashboard-status-gate');
const signInLink = document.querySelector('#admin-dashboard-signin');
const signOutButton = document.querySelector('#admin-dashboard-signout');
const metrics = {
    publishedResources: document.querySelector('#dashboard-published-resources'),
    publishedReleases: document.querySelector('#dashboard-published-releases'),
    openInquiries: document.querySelector('#dashboard-open-inquiries'),
    draftReleases: document.querySelector('#dashboard-draft-releases'),
    inReviewReleases: document.querySelector('#dashboard-in-review-releases'),
    pendingReports: document.querySelector('#dashboard-pending-reports')
};
const recentReleases = document.querySelector('#dashboard-recent-releases');
const recentInquiries = document.querySelector('#dashboard-recent-inquiries');
const recentAdminActivity = document.querySelector('#dashboard-recent-admin-activity');
const widgetContainer = document.querySelector('#dashboard-widgets');
const layoutStatus = document.querySelector('#dashboard-layout-status');
const saveLayoutButton = document.querySelector('#dashboard-save-layout');
const resetLayoutButton = document.querySelector('#dashboard-reset-layout');
const analyticsStatus = document.querySelector('#dashboard-analytics-status');
const widgetOrderDefault = ['overview', 'activity', 'quick-actions', 'analytics'];
const widgetLabels = {
    overview: 'Workspace overview',
    activity: 'Recent activity',
    'quick-actions': 'Quick actions',
    analytics: 'Downloads and storage'
};
const draggedWidgetMime = 'text/dashboard-widget-id';
let draggedWidget = null;
let widgetControlsReady = false;
const hasOverview = Object.values(metrics).every(Boolean) && recentReleases && recentInquiries && recentAdminActivity;
const isOverviewPage = Boolean(widgetContainer);
const hasOverviewControls = Boolean(
    dashboardStatus && layoutStatus && saveLayoutButton && resetLayoutButton && analyticsStatus
);

function showStatus(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function showSignedOut() {
    dashboard.hidden = true;
    gate.hidden = false;
    signOutButton.hidden = true;
    signInLink.hidden = false;
    showStatus(gateStatus, 'Sign in with a staff account to open the admin dashboard.');
}

function setListMessage(list, message, kind = '') {
    const item = document.createElement('li');
    item.className = `dashboard-activity-empty${kind ? ` ${kind}` : ''}`;
    item.textContent = message;
    list.replaceChildren(item);
}

function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function isMissingSchemaObject(error) {
    return ['PGRST205', '42P01'].includes(error?.code);
}

function formatCount(value) {
    return Number(value ?? 0).toLocaleString();
}

function formatBytes(value) {
    if (value === null || value === undefined) return 'Unavailable';
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unit = -1;
    do {
        size /= 1024;
        unit += 1;
    } while (size >= 1024 && unit < units.length - 1);
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatAnalyticsDate(value, options = { month: 'short', day: 'numeric' }) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
        ? 'Date unavailable'
        : new Intl.DateTimeFormat(undefined, options).format(date);
}

function appendActivity(list, title, detail, date) {
    const item = document.createElement('li');
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    const description = document.createElement('span');
    const time = document.createElement('time');

    item.className = 'dashboard-activity-item';
    content.className = 'dashboard-activity-copy';
    heading.textContent = title;
    description.textContent = detail;
    time.textContent = formatDate(date);
    if (date && !Number.isNaN(new Date(date).getTime())) time.dateTime = new Date(date).toISOString();

    content.append(heading, description);
    item.append(content, time);
    list.append(item);
}

function renderChart(container, entries, labelFor, valueFor, valueFormat = formatCount) {
    if (!container) return;
    const values = entries.map(valueFor);
    const maximum = Math.max(1, ...values);
    const rows = entries.map((entry, index) => {
        const row = document.createElement('div');
        const label = document.createElement('span');
        const track = document.createElement('span');
        const bar = document.createElement('span');
        const value = document.createElement('strong');
        const amount = values[index];

        row.className = 'dashboard-chart-row';
        row.setAttribute('aria-label', `${labelFor(entry)}: ${valueFormat(amount)}`);
        label.className = 'dashboard-chart-label';
        label.textContent = labelFor(entry);
        track.className = 'dashboard-chart-track';
        bar.className = 'dashboard-chart-bar';
        bar.style.width = amount ? `${Math.max(2, amount / maximum * 100)}%` : '0%';
        track.append(bar);
        value.className = 'dashboard-chart-value';
        value.textContent = valueFormat(amount);
        row.append(label, track, value);
        return row;
    });
    container.replaceChildren(...rows);
}

function renderRankedList(container, entries, labelFor, valueFor, valueFormat = formatCount) {
    if (!container) return;
    if (!entries.length) {
        const empty = document.createElement('li');
        empty.className = 'dashboard-analytics-empty';
        empty.textContent = 'No download data for this period.';
        container.replaceChildren(empty);
        return;
    }

    container.replaceChildren(...entries.map((entry) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        const value = document.createElement('strong');
        label.textContent = labelFor(entry);
        value.textContent = valueFormat(valueFor(entry));
        item.append(label, value);
        return item;
    }));
}

async function loadDashboardAnalytics() {
    if (!analyticsStatus) return;
    showStatus(analyticsStatus, 'Loading aggregate analytics…');
    const { data, error } = await supabase.rpc('get_admin_analytics', { p_days: 30 });
    if (error) throw error;
    if (!data || typeof data !== 'object') {
        throw new Error('The analytics function returned an invalid response.');
    }

    document.querySelector('#dashboard-downloads-current').textContent = formatCount(data.downloads_last_30_days);
    document.querySelector('#dashboard-downloads-previous').textContent = formatCount(data.downloads_previous_30_days);
    document.querySelector('#dashboard-storage-current').textContent = formatBytes(data.current_storage_bytes);
    renderChart(
        document.querySelector('#dashboard-daily-downloads'),
        data.daily_downloads ?? [],
        (entry) => formatAnalyticsDate(entry.date),
        (entry) => Number(entry.count)
    );
    renderChart(
        document.querySelector('#dashboard-weekly-downloads'),
        data.weekly_downloads ?? [],
        (entry) => formatAnalyticsDate(entry.week, { month: 'short', day: 'numeric' }),
        (entry) => Number(entry.count)
    );
    renderRankedList(
        document.querySelector('#dashboard-popular-resources'),
        data.popular_resources ?? [],
        (entry) => `${entry.resource} · ${entry.type}`,
        (entry) => Number(entry.downloads)
    );
    renderRankedList(
        document.querySelector('#dashboard-category-downloads'),
        data.category_downloads ?? [],
        (entry) => entry.category,
        (entry) => Number(entry.downloads)
    );
    renderChart(
        document.querySelector('#dashboard-storage-history'),
        data.storage_history ?? [],
        (entry) => formatAnalyticsDate(entry.date),
        (entry) => Number(entry.bytes),
        formatBytes
    );
    showStatus(analyticsStatus, `Analytics refreshed ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generated_at))}. Storage snapshots begin with this report; earlier history is unavailable.`);
}

function getWidgets() {
    return [...widgetContainer.querySelectorAll(':scope > [data-dashboard-widget]')];
}

function updateWidgetControls() {
    const widgets = getWidgets();
    widgets.forEach((widget, index) => {
        const upButton = widget.querySelector('[data-widget-move="up"]');
        const downButton = widget.querySelector('[data-widget-move="down"]');
        upButton.disabled = index === 0;
        downButton.disabled = index === widgets.length - 1;
        widget.setAttribute('aria-posinset', String(index + 1));
        widget.setAttribute('aria-setsize', String(widgets.length));
    });
}

function setWidgetOrder(order) {
    const widgetsById = new Map(getWidgets().map((widget) => [widget.dataset.dashboardWidget, widget]));
    if (order.length !== widgetOrderDefault.length
        || new Set(order).size !== widgetOrderDefault.length
        || order.some((id) => !widgetsById.has(id))) {
        throw new Error('The saved dashboard layout contains an unknown widget.');
    }
    for (const id of order) widgetContainer.append(widgetsById.get(id));
    updateWidgetControls();
}

function moveWidget(widget, direction) {
    const widgets = getWidgets();
    const index = widgets.indexOf(widget);
    const next = index + direction;
    if (next < 0 || next >= widgets.length) return;
    if (direction < 0) widgetContainer.insertBefore(widget, widgets[next]);
    else widgetContainer.insertBefore(widgets[next], widget);
    updateWidgetControls();
    showStatus(layoutStatus, 'Layout changed. Save to keep this order on your staff account.');
}

function setupWidgetControls() {
    if (widgetControlsReady) return;
    widgetControlsReady = true;
    for (const widget of getWidgets()) {
        const id = widget.dataset.dashboardWidget;
        const controls = document.createElement('div');
        const hint = document.createElement('span');
        controls.className = 'dashboard-widget-controls';
        hint.textContent = 'Drag to reorder · use buttons for keyboard or touch';
        controls.append(hint);
        for (const [direction, label] of [['up', 'Move up'], ['down', 'Move down']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.widgetMove = direction;
            button.setAttribute('aria-label', `${label} ${widgetLabels[id]}`);
            button.textContent = label;
            button.addEventListener('click', () => moveWidget(widget, direction === 'up' ? -1 : 1));
            controls.append(button);
        }
        widget.prepend(controls);
        widget.draggable = true;
    }
    updateWidgetControls();

    widgetContainer.addEventListener('dragstart', (event) => {
        const widget = event.target.closest('[data-dashboard-widget]');
        if (!widget || event.target.closest('button, a, input, select, textarea')) {
            event.preventDefault();
            return;
        }
        draggedWidget = widget;
        widget.classList.add('dashboard-widget-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(draggedWidgetMime, widget.dataset.dashboardWidget);
    });
    widgetContainer.addEventListener('dragend', () => {
        draggedWidget?.classList.remove('dashboard-widget-dragging');
        getWidgets().forEach((widget) => widget.classList.remove('dashboard-widget-drop-target'));
        draggedWidget = null;
    });
    widgetContainer.addEventListener('dragover', (event) => {
        const target = event.target.closest('[data-dashboard-widget]');
        if (!draggedWidget || !target || target === draggedWidget) return;
        event.preventDefault();
        target.classList.add('dashboard-widget-drop-target');
    });
    widgetContainer.addEventListener('dragleave', (event) => {
        event.target.closest('[data-dashboard-widget]')?.classList.remove('dashboard-widget-drop-target');
    });
    widgetContainer.addEventListener('drop', (event) => {
        const target = event.target.closest('[data-dashboard-widget]');
        if (!draggedWidget || !target || target === draggedWidget) return;
        event.preventDefault();
        const bounds = target.getBoundingClientRect();
        const insertBefore = event.clientY < bounds.top + bounds.height / 2;
        widgetContainer.insertBefore(draggedWidget, insertBefore ? target : target.nextElementSibling);
        draggedWidget.classList.remove('dashboard-widget-dragging');
        draggedWidget = null;
        getWidgets().forEach((widget) => widget.classList.remove('dashboard-widget-drop-target'));
        updateWidgetControls();
        showStatus(layoutStatus, 'Layout changed. Save to keep this order on your staff account.');
    });
}

async function loadDashboardLayout() {
    setupWidgetControls();
    const { data, error } = await supabase.rpc('get_admin_dashboard_layout');
    if (error) throw error;
    setWidgetOrder(data ?? widgetOrderDefault);
    showStatus(layoutStatus, 'Your saved dashboard layout is loaded.');
}

async function saveDashboardLayout(order = getWidgets().map((widget) => widget.dataset.dashboardWidget)) {
    saveLayoutButton.disabled = true;
    resetLayoutButton.disabled = true;
    showStatus(layoutStatus, 'Saving your private staff layout…');
    try {
        const { error } = await supabase.rpc('save_admin_dashboard_layout', { p_widget_order: order });
        if (error) throw error;
        showStatus(layoutStatus, 'Dashboard layout saved to your staff account.');
    } catch (error) {
        console.error('Could not save the dashboard layout.', error);
        showStatus(layoutStatus, 'Could not save the layout. Check the latest Supabase schema and try again.', 'error');
    } finally {
        saveLayoutButton.disabled = false;
        resetLayoutButton.disabled = false;
    }
}

async function loadDashboardData() {
    showStatus(dashboardStatus, 'Loading workspace overview…');
    for (const metric of Object.values(metrics)) metric.textContent = '—';
    setListMessage(recentReleases, 'Loading releases…');
    setListMessage(recentInquiries, 'Loading inquiries…');
    setListMessage(recentAdminActivity, 'Loading activity…');

    const [
        publishedResourcesResult,
        publishedReleasesResult,
        openInquiriesResult,
        draftReleasesResult,
        inReviewReleasesResult,
        pendingReportsResult,
        releasesResult,
        inquiriesResult,
        activityResult
    ] = await Promise.all([
        supabase.from('resources').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('resource_releases').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('inquiries').select('id', { count: 'exact', head: true })
            .in('status', ['new', 'reviewing', 'contacted', 'in progress']),
        supabase.from('resource_releases').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
        supabase.from('resource_releases').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
        supabase.from('resource_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('resource_releases')
            .select('id,resource_id,version,build_format,published_at')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(5),
        supabase.from('inquiries')
            .select('id,name,service,status,created_at')
            .order('created_at', { ascending: false })
            .limit(5),
        supabase.from('admin_activity_log')
            .select('action,resource_id,created_at')
            .order('created_at', { ascending: false })
            .limit(5)
    ]);

    const requiredResults = [
        publishedResourcesResult,
        publishedReleasesResult,
        openInquiriesResult,
        draftReleasesResult,
        inReviewReleasesResult,
        releasesResult,
        inquiriesResult
    ];
    const failedResult = requiredResults.find((result) => result.error);
    if (failedResult) throw failedResult.error;
    if (pendingReportsResult.error && !isMissingSchemaObject(pendingReportsResult.error)) {
        throw pendingReportsResult.error;
    }
    if (activityResult.error && !isMissingSchemaObject(activityResult.error)) {
        throw activityResult.error;
    }

    const releases = releasesResult.data ?? [];
    let resourceTitles = new Map();
    if (releases.length) {
        const { data, error } = await supabase.from('resources')
            .select('id,title')
            .in('id', [...new Set(releases.map((release) => release.resource_id))]);
        if (error) throw error;
        resourceTitles = new Map((data ?? []).map((resource) => [resource.id, resource.title]));
    }

    metrics.publishedResources.textContent = String(publishedResourcesResult.count ?? 0);
    metrics.publishedReleases.textContent = String(publishedReleasesResult.count ?? 0);
    metrics.openInquiries.textContent = String(openInquiriesResult.count ?? 0);
    metrics.draftReleases.textContent = String(draftReleasesResult.count ?? 0);
    metrics.inReviewReleases.textContent = String(inReviewReleasesResult.count ?? 0);
    metrics.pendingReports.textContent = pendingReportsResult.error
        ? '—'
        : String(pendingReportsResult.count ?? 0);

    if (releases.length) {
        recentReleases.replaceChildren();
        for (const release of releases) {
            const title = resourceTitles.get(release.resource_id) ?? release.resource_id;
            const format = release.build_format
                ? `Android ${release.build_format.toUpperCase()}`
                : 'Theme or project package';
            appendActivity(recentReleases, title, `Version ${release.version} · ${format}`, release.published_at);
        }
    } else {
        setListMessage(recentReleases, 'No published releases yet.');
    }

    const inquiries = inquiriesResult.data ?? [];
    if (inquiries.length) {
        recentInquiries.replaceChildren();
        for (const inquiry of inquiries) {
            appendActivity(
                recentInquiries,
                inquiry.name,
                `${inquiry.service} · ${inquiry.status}`,
                inquiry.created_at
            );
        }
    } else {
        setListMessage(recentInquiries, 'No inquiries yet.');
    }

    const activity = activityResult.data ?? [];
    if (activity.length) {
        recentAdminActivity.replaceChildren();
        for (const entry of activity) {
            appendActivity(
                recentAdminActivity,
                entry.action.replaceAll('-', ' '),
                entry.resource_id ?? 'Workspace',
                entry.created_at
            );
        }
    } else if (activityResult.error) {
        setListMessage(recentAdminActivity, 'Apply the latest Supabase schema to enable the staff activity log.');
    } else {
        setListMessage(recentAdminActivity, 'No staff activity recorded yet.');
    }

    showStatus(
        dashboardStatus,
        pendingReportsResult.error || activityResult.error
            ? 'Core overview is available. Apply the latest Supabase schema to enable report counts and staff activity.'
            : 'Workspace overview is up to date.'
    );
}

if (!dashboard || !gate || !gateStatus || !signInLink || !signOutButton) {
    console.error('The staff page is missing shared access-control elements.');
} else if (!supabase) {
    showStatus(gateStatus, 'Supabase is not configured, so staff access cannot be checked.', 'error');
} else {
    if (isOverviewPage && !hasOverviewControls) {
        console.error('The admin dashboard is missing overview controls.');
    }
    if (isOverviewPage && hasOverviewControls) {
        saveLayoutButton.addEventListener('click', () => {
            void saveDashboardLayout();
        });
        resetLayoutButton.addEventListener('click', () => {
            setWidgetOrder(widgetOrderDefault);
            void saveDashboardLayout(widgetOrderDefault);
        });
    }
    gate.hidden = false;
    dashboard.hidden = true;

    onAuthStateChanged(async (user) => {
        if (!user) {
            showSignedOut();
            return;
        }

        signInLink.hidden = true;
        showStatus(gateStatus, 'Verifying staff access…');
        try {
            if (!await userIsStaff()) {
                showStatus(gateStatus, 'This account is signed in but is not authorized to use staff tools.', 'error');
                dashboard.hidden = true;
                signOutButton.hidden = true;
                return;
            }

            gate.hidden = true;
            dashboard.hidden = false;
            signOutButton.hidden = false;
            if (!isOverviewPage) return;
            if (!hasOverviewControls) {
                showStatus(dashboardStatus ?? gateStatus, 'The admin dashboard is missing required overview controls.', 'error');
                return;
            }
            const dashboardTasks = await Promise.allSettled([
                hasOverview ? loadDashboardData() : Promise.resolve(),
                loadDashboardAnalytics(),
                loadDashboardLayout()
            ]);
            if (dashboardTasks[0].status === 'rejected') {
                console.error('Could not load admin dashboard data.', dashboardTasks[0].reason);
                showStatus(dashboardStatus, 'Dashboard data could not be loaded. Check database access and reload.', 'error');
                setListMessage(recentReleases, 'Could not load releases.', 'dashboard-activity-error');
                setListMessage(recentInquiries, 'Could not load inquiries.', 'dashboard-activity-error');
                setListMessage(recentAdminActivity, 'Could not load staff activity.', 'dashboard-activity-error');
            }
            if (dashboardTasks[1].status === 'rejected') {
                console.error('Could not load aggregate dashboard analytics.', dashboardTasks[1].reason);
                showStatus(analyticsStatus, 'Analytics could not load. Apply the latest Supabase schema and check staff access.', 'error');
            }
            if (dashboardTasks[2].status === 'rejected') {
                console.error('Could not load the private dashboard layout.', dashboardTasks[2].reason);
                showStatus(layoutStatus, 'Saved layout could not load. Apply the latest Supabase schema; widgets remain in their default order.', 'error');
            }
        } catch (error) {
            console.error('Could not verify admin dashboard staff access.', error);
            showStatus(gateStatus, 'Staff access could not be verified. Check the Supabase staff role and try again.', 'error');
            dashboard.hidden = true;
        }
    }, (error) => {
        console.error('Could not check admin dashboard account access.', error);
        showStatus(gateStatus, 'Account access could not be checked. Check your connection and reload.', 'error');
    });

    signOutButton.addEventListener('click', async () => {
        signOutButton.disabled = true;
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            showSignedOut();
        } catch (error) {
            console.error('Could not sign out from the admin dashboard.', error);
            showStatus(dashboardStatus ?? gateStatus, 'Could not sign out. Please try again.', 'error');
        } finally {
            signOutButton.disabled = false;
        }
    });
}
