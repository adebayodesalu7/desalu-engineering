const tabs = document.querySelectorAll('[data-auth-tab]');
const panels = document.querySelectorAll('[data-auth-panel]');
const welcomeTitle = document.querySelector('#welcome-title');

function selectAuthTab(selectedTab) {
    const selectedMode = selectedTab.dataset.authTab;

    tabs.forEach((tab) => {
        const isSelected = tab === selectedTab;
        tab.classList.toggle('is-active', isSelected);
        tab.setAttribute('aria-selected', String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
    });

    panels.forEach((panel) => {
        panel.hidden = panel.dataset.authPanel !== selectedMode;
    });

    welcomeTitle.textContent = selectedMode === 'signup' ? 'Let’s get started.' : 'Welcome back.';
}

tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectAuthTab(tab));
    tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
            selectAuthTab(nextTab);
            nextTab.focus();
        }
    });
});

if (window.location.hash === '#signup') {
    selectAuthTab(document.querySelector('[data-auth-tab="signup"]'));
}
