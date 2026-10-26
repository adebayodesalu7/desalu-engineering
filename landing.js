const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#nav-links');
const currentYear = document.querySelector('#current-year');

if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
}

if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
        const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!isExpanded));
        navLinks.classList.toggle('is-open', !isExpanded);
    });

    navLinks.addEventListener('click', (event) => {
        if (event.target instanceof HTMLAnchorElement) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navLinks.classList.remove('is-open');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navLinks.classList.remove('is-open');
            menuToggle.focus();
        }
    });
}
