import { supabase } from './supabase-client.js';
import { onAuthStateChanged, userIsStaff } from './supabase-auth.js';

const status = document.querySelector('#admin-status');
const list = document.querySelector('#inquiry-list');
const count = document.querySelector('#inquiry-count');
const totalSummary = document.querySelector('#summary-total');
const openSummary = document.querySelector('#summary-open');
const closedSummary = document.querySelector('#summary-closed');
const signOutButton = document.querySelector('#admin-signout');
const template = document.querySelector('#inquiry-card-template');
const inquiryStatuses = ['new', 'reviewing', 'contacted', 'in progress', 'closed'];

function showStatus(message, kind = '') {
    status.textContent = message;
    status.dataset.kind = kind;
}

function showUpdateStatus(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function createInquiryCard(data) {
    const card = template.content.firstElementChild.cloneNode(true);
    const updateForm = card.querySelector('.inquiry-update-form');
    const updateButton = card.querySelector('.inquiry-save');
    const updateStatus = card.querySelector('.inquiry-update-status');
    const statusSelect = card.querySelector('.inquiry-status-select');
    const staffNotes = card.querySelector('.inquiry-notes');

    if (data.message?.startsWith('AI chat follow-up request')) {
        const source = card.querySelector('.inquiry-source');
        source.textContent = 'AI chat follow-up';
        source.hidden = false;
    }

    card.querySelector('.inquiry-service').textContent = data.service;
    card.querySelector('.inquiry-name').textContent = data.name;
    card.querySelector('.inquiry-date').textContent = formatDate(data.created_at);
    card.querySelector('.inquiry-id').textContent = `Reference ${data.id.slice(0, 8).toUpperCase()}`;
    const contact = card.querySelector('.inquiry-contact');
    const emailLink = document.createElement('a');
    emailLink.href = `mailto:${data.email}`;
    emailLink.textContent = data.email;
    contact.append(emailLink);
    card.querySelector('.inquiry-company').textContent = data.company ? `Company: ${data.company}` : 'No company provided';
    card.querySelector('.inquiry-timeline').textContent = data.timeline ? `Ideal timing: ${data.timeline}` : 'Timing not specified';
    card.querySelector('.inquiry-message').textContent = data.message;
    statusSelect.value = inquiryStatuses.includes(data.status) ? data.status : 'new';
    const statusBadge = card.querySelector('.inquiry-status-badge');
    statusBadge.textContent = statusSelect.value;
    statusBadge.dataset.status = statusSelect.value.replaceAll(' ', '-');
    staffNotes.value = data.staff_notes || '';
    statusSelect.addEventListener('change', () => {
        statusBadge.textContent = statusSelect.value;
        statusBadge.dataset.status = statusSelect.value.replaceAll(' ', '-');
    });

    updateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        updateButton.disabled = true;
        showUpdateStatus(updateStatus, '');
        try {
            const { error } = await supabase.from('inquiries')
                .update({ status: statusSelect.value, staff_notes: staffNotes.value.trim() })
                .eq('id', data.id);
            if (error) throw error;
            card.classList.add('inquiry-card-saved');
            window.setTimeout(() => card.classList.remove('inquiry-card-saved'), 1200);
            showUpdateStatus(updateStatus, 'Update saved.');
        } catch (error) {
            console.error('Could not update the inquiry.', error);
            showUpdateStatus(updateStatus, 'Could not save the update. Verify staff access and try again.', 'error');
        } finally {
            updateButton.disabled = false;
        }
    });

    return card;
}

async function loadInquiries() {
    showStatus('Loading project inquiries…');
    list.replaceChildren();
    try {
        const { data, error } = await supabase.from('inquiries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;

        if (!data.length) {
            count.hidden = true;
            totalSummary.textContent = '0';
            openSummary.textContent = '0';
            closedSummary.textContent = '0';
            showStatus('No project inquiries yet.');
            return;
        }

        const closed = data.filter((item) => item.status === 'closed').length;
        const open = data.filter((item) =>
            ['new', 'reviewing', 'contacted', 'in progress'].includes(item.status)
        ).length;
        totalSummary.textContent = String(data.length);
        openSummary.textContent = String(open);
        closedSummary.textContent = String(closed);
        list.replaceChildren(...data.map(createInquiryCard));
        count.textContent = `${data.length}${data.length === 50 ? '+' : ''} recent`;
        count.hidden = false;
        showStatus('Project inquiries loaded.');
    } catch (error) {
        console.error('Could not load project inquiries.', error);
        showStatus('Could not load inquiries. Verify Supabase staff access and try again.', 'error');
    }
}

if (!supabase) {
    showStatus('Supabase services are not configured.', 'error');
} else {
    onAuthStateChanged(async (user) => {
        list.replaceChildren();
        count.hidden = true;
        if (!user) {
            signOutButton.hidden = true;
            totalSummary.textContent = '—';
            openSummary.textContent = '—';
            closedSummary.textContent = '—';
            showStatus('Sign in with your staff account to view project inquiries.');
            return;
        }

        signOutButton.hidden = false;
        try {
            if (!await userIsStaff()) {
                totalSummary.textContent = '—';
                openSummary.textContent = '—';
                closedSummary.textContent = '—';
                showStatus(`Signed in as ${user.email ?? 'an account'}, but this account does not have staff access.`, 'error');
                return;
            }
            await loadInquiries();
        } catch (error) {
            console.error('Could not verify staff access.', error);
            showStatus('Staff access could not be verified. Check the Supabase staff role and try again.', 'error');
        }
    }, (error) => {
        console.error('Could not check the current staff account.', error);
        showStatus('Account access could not be checked. Reload and try again.', 'error');
    });

    signOutButton.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Could not sign out of the staff dashboard.', error);
            showStatus('Could not sign out. Please try again.', 'error');
        }
    });
}
