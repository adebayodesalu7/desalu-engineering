import { supabase } from './supabase-client.js';

const form = document.querySelector('#project-inquiry');
const status = document.querySelector('#inquiry-status');
const submitButton = form.querySelector('.inquiry-submit');
const startedAt = Date.now();
const minimumCompletionTimeMs = 3500;

function showStatus(message, kind = '') {
    status.textContent = message;
    status.dataset.kind = kind;
}

if (!supabase) {
    showStatus('Project inquiries are unavailable until Supabase is configured.', 'error');
    submitButton.disabled = true;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showStatus('');

    if (!form.reportValidity()) return;
    if (Date.now() - startedAt < minimumCompletionTimeMs) {
        showStatus('Please take a moment to review your project details before sending.', 'error');
        return;
    }
    if (form.elements.website.value.trim()) {
        showStatus('We could not accept that submission. Please review the form and try again.', 'error');
        return;
    }
    if (!supabase) {
        showStatus('Project inquiries are not configured yet. Please try again later.', 'error');
        return;
    }

    const data = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        company: form.elements.company.value.trim(),
        service: form.elements.service.value,
        timeline: form.elements.timeline.value,
        message: form.elements.message.value.trim()
    };

    submitButton.disabled = true;
    submitButton.querySelector('span').textContent = 'Sending…';
    try {
        const { error } = await supabase.from('inquiries').insert(data);
        if (error) throw error;
        form.reset();
        showStatus('Thank you—your inquiry was sent. We’ll follow up using the email you provided.', 'success');
    } catch (error) {
        console.error('Could not save the project inquiry.', error);
        showStatus('We could not send your inquiry. Please try again in a moment.', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.querySelector('span').textContent = 'Send project inquiry';
    }
});
