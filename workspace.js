import { supabase } from './supabase-client.js';
import { onAuthStateChanged } from './supabase-auth.js';

const list = document.querySelector('#saved-brief-list');
const status = document.querySelector('#workspace-status');
const template = document.querySelector('#saved-brief-template');
const bookmarksList = document.querySelector('#bookmarks-list');
const bookmarksStatus = document.querySelector('#bookmarks-status');
const historyList = document.querySelector('#download-history-list');
const historyStatus = document.querySelector('#history-status');

if (list && status && template) {
    function setStatus(message, kind = '') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function setSectionStatus(element, message, kind = '') {
        if (!element) return;
        element.textContent = message;
        element.dataset.kind = kind;
    }

    function formatDate(value) {
        if (!value) return 'Date unavailable';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? 'Date unavailable'
            : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
    }

    async function loadBookmarks(user) {
        if (!bookmarksList || !bookmarksStatus) return;
        setSectionStatus(bookmarksStatus, 'Loading bookmarks…');
        try {
            const { data, error } = await supabase
                .from('bookmarks')
                .select('resource_id,resource_title')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            bookmarksList.replaceChildren();
            data.forEach((bookmark) => {
                const row = document.createElement('article');
                row.className = 'workspace-resource-item';
                const link = document.createElement('a');
                link.href = 'resources.html';
                link.textContent = bookmark.resource_title || 'Saved resource';
                const removeButton = document.createElement('button');
                removeButton.className = 'text-button';
                removeButton.type = 'button';
                removeButton.textContent = 'Remove';
                removeButton.addEventListener('click', async () => {
                    removeButton.disabled = true;
                    try {
                        const { error: removeError } = await supabase
                            .from('bookmarks')
                            .delete()
                            .eq('resource_id', bookmark.resource_id)
                            .eq('user_id', user.id);
                        if (removeError) throw removeError;
                        row.remove();
                        setSectionStatus(bookmarksStatus, bookmarksList.children.length
                            ? `${bookmarksList.children.length} bookmarked resources.`
                            : 'No bookmarks yet. Browse the library to save resources.');
                    } catch (error) {
                        console.error('Could not remove the resource bookmark.', error);
                        removeButton.disabled = false;
                        setSectionStatus(bookmarksStatus, 'Could not remove this bookmark. Please try again.', 'error');
                    }
                });
                row.append(link, removeButton);
                bookmarksList.append(row);
            });
            setSectionStatus(bookmarksStatus, data.length
                ? `${data.length} bookmarked ${data.length === 1 ? 'resource' : 'resources'}.`
                : 'No bookmarks yet. Browse the library to save resources.');
        } catch (error) {
            console.error('Could not load resource bookmarks.', error);
            setSectionStatus(bookmarksStatus, 'Could not load bookmarks. Check your connection and reload.', 'error');
        }
    }

    async function loadDownloadHistory(user) {
        if (!historyList || !historyStatus) return;
        setSectionStatus(historyStatus, 'Loading download history…');
        try {
            const { data, error } = await supabase
                .from('download_history')
                .select('resource_title,version,downloaded_at')
                .eq('user_id', user.id)
                .order('downloaded_at', { ascending: false });
            if (error) throw error;
            historyList.replaceChildren();
            data.forEach((download) => {
                const row = document.createElement('article');
                row.className = 'workspace-resource-item';
                const details = document.createElement('div');
                const title = document.createElement('a');
                title.href = 'resources.html';
                title.textContent = download.resource_title || 'Downloaded resource';
                const version = document.createElement('p');
                version.textContent = `Version ${download.version || 'unknown'} · ${formatDate(download.downloaded_at)}`;
                details.append(title, version);
                row.append(details);
                historyList.append(row);
            });
            setSectionStatus(historyStatus, data.length
                ? `${data.length} download ${data.length === 1 ? 'record' : 'records'}.`
                : 'Your downloaded releases will appear here.');
        } catch (error) {
            console.error('Could not load resource download history.', error);
            setSectionStatus(historyStatus, 'Could not load download history. Check your connection and reload.', 'error');
        }
    }

    function renderBrief(brief, user) {
        const fragment = template.content.cloneNode(true);
        const card = fragment.querySelector('.saved-brief-card');
        const editor = card.querySelector('.saved-brief-editor');
        const titleInput = card.querySelector('.saved-brief-title-input');
        const contentInput = card.querySelector('.saved-brief-content-input');
        const editStatus = card.querySelector('.saved-brief-edit-status');
        let title = brief.title || 'Untitled brief';
        let content = brief.content || '';

        card.querySelector('.saved-brief-service').textContent = brief.service || 'Project';
        card.querySelector('.saved-brief-title').textContent = title;
        card.querySelector('.saved-brief-date').textContent = `Updated ${formatDate(brief.updated_at)}`;
        card.querySelector('.saved-brief-content').textContent = content;
        titleInput.value = title;
        contentInput.value = content;

        card.querySelector('.saved-brief-edit').addEventListener('click', () => {
            editor.hidden = false;
            titleInput.focus();
        });
        card.querySelector('.saved-brief-cancel').addEventListener('click', () => {
            titleInput.value = title;
            contentInput.value = content;
            editStatus.textContent = '';
            editor.hidden = true;
        });
        card.querySelector('.saved-brief-delete').addEventListener('click', async () => {
            if (!window.confirm(`Delete "${title}" from your workspace?`)) return;
            const deleteButton = card.querySelector('.saved-brief-delete');
            deleteButton.disabled = true;
            try {
                const { error } = await supabase.from('saved_briefs')
                    .delete().eq('id', brief.id).eq('user_id', user.id);
                if (error) throw error;
                card.remove();
                if (!list.children.length) setStatus('No saved briefs yet. Your next project plan can be saved here.');
            } catch (error) {
                console.error('Could not delete the saved project brief.', error);
                deleteButton.disabled = false;
                editStatus.textContent = 'Could not delete this brief. Check your connection and try again.';
                editStatus.dataset.kind = 'error';
            }
        });

        editor.addEventListener('submit', async (event) => {
            event.preventDefault();
            const newTitle = titleInput.value.trim();
            const newContent = contentInput.value.trim();
            if (newTitle.length < 3 || newContent.length < 20) {
                editStatus.textContent = 'Enter a title and a brief with at least 20 characters.';
                editStatus.dataset.kind = 'error';
                return;
            }

            const saveButton = card.querySelector('.saved-brief-save');
            saveButton.disabled = true;
            editStatus.textContent = 'Saving changes…';
            editStatus.dataset.kind = '';
            try {
                const { error } = await supabase.from('saved_briefs')
                    .update({ title: newTitle, content: newContent })
                    .eq('id', brief.id)
                    .eq('user_id', user.id);
                if (error) throw error;
                title = newTitle;
                content = newContent;
                card.querySelector('.saved-brief-title').textContent = newTitle;
                card.querySelector('.saved-brief-content').textContent = newContent;
                card.querySelector('.saved-brief-date').textContent = 'Updated just now';
                editor.hidden = true;
            } catch (error) {
                console.error('Could not update the saved project brief.', error);
                editStatus.textContent = 'Could not update this brief. Check your connection and try again.';
                editStatus.dataset.kind = 'error';
            } finally {
                saveButton.disabled = false;
            }
        });

        return fragment;
    }

    async function loadBriefs(user) {
        setStatus('Loading your saved briefs…');
        try {
            const { data, error } = await supabase
                .from('saved_briefs')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            list.replaceChildren();
            data.forEach((brief) => list.append(renderBrief(brief, user)));
            setStatus(data.length
                ? `${data.length} saved ${data.length === 1 ? 'brief' : 'briefs'}.`
                : 'No saved briefs yet. Your next project plan can be saved here.');
        } catch (error) {
            console.error('Could not load saved project briefs.', error);
            setStatus('Could not load your saved briefs. Check your connection and reload.', 'error');
        }
    }

    if (!supabase) {
        setStatus('Supabase account services are not configured yet.', 'error');
    } else {
        onAuthStateChanged((user) => {
            if (user) {
                void loadBriefs(user);
                void loadBookmarks(user);
                void loadDownloadHistory(user);
            } else {
                list.replaceChildren();
                setStatus('Sign in to view your saved briefs.');
                bookmarksList?.replaceChildren();
                historyList?.replaceChildren();
                setSectionStatus(bookmarksStatus, 'Sign in to view your bookmarks.');
                setSectionStatus(historyStatus, 'Sign in to view your download history.');
            }
        }, (error) => {
            console.error('Could not check account access to the workspace.', error);
            setStatus('Your account could not be checked. Reload and try again.', 'error');
        });
    }
}
