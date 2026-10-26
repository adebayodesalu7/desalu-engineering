import { supabase } from './supabase-client.js';
import { onAuthStateChanged } from './supabase-auth.js';

const planner = document.querySelector('#project-planner');
const saveButton = document.querySelector('#planner-save');

if (planner && saveButton) {
    const status = document.querySelector('#planner-status');
    const result = document.querySelector('#planner-result');
    let currentUser = null;
    let authReady = false;

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function pendingDraft() {
        const serialized = sessionStorage.getItem('desalu-pending-project-brief');
        if (!serialized) return null;

        try {
            const draft = JSON.parse(serialized);
            if (
                typeof draft.content !== 'string'
                || draft.content.length < 20
                || draft.content.length > 3000
                || typeof draft.service !== 'string'
            ) {
                throw new Error('The pending project brief has invalid fields.');
            }
            return draft;
        } catch (error) {
            console.error('Could not read the pending project brief.', error);
            sessionStorage.removeItem('desalu-pending-project-brief');
            setStatus('The pending brief could not be read. Please create it again.', 'error');
            return null;
        }
    }

    async function saveBrief(user, draft) {
        if (!supabase) {
            setStatus('Brief saving is unavailable because Supabase is not configured.', 'error');
            return;
        }

        saveButton.disabled = true;
        try {
            const { error } = await supabase.from('saved_briefs').insert({
                title: `${draft.service} brief`.slice(0, 80),
                service: draft.service,
                content: draft.content,
                user_id: user.id
            });
            if (error) throw error;
            sessionStorage.removeItem('desalu-pending-project-brief');
            setStatus('Your brief is saved in your workspace.');
        } catch (error) {
            console.error('Could not save the project brief.', error);
            setStatus('We could not save your brief. Check your connection and try again.', 'error');
        } finally {
            saveButton.disabled = false;
        }
    }

    if (supabase) {
        onAuthStateChanged((user) => {
            currentUser = user;
            authReady = true;
            const draft = user ? pendingDraft() : null;
            if (user && draft) void saveBrief(user, draft);
        }, (error) => {
            console.error('Could not check the current account for project brief saving.', error);
            setStatus('Account status could not be checked. Reload the page and try again.', 'error');
        });
    }

    saveButton.addEventListener('click', () => {
        if (!authReady) {
            setStatus('Checking your account. Try saving again in a moment.');
            return;
        }

        const draft = {
            service: planner.elements.service.value,
            content: result.value.trim()
        };
        if (draft.content.length < 20) {
            setStatus('Create a project brief before saving it.', 'error');
            return;
        }

        if (!currentUser) {
            sessionStorage.setItem('desalu-pending-project-brief', JSON.stringify(draft));
            window.location.href = 'auth.html?returnTo=planner#signup';
            return;
        }

        void saveBrief(currentUser, draft);
    });
}
