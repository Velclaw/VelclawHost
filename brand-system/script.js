const menuToggle = document.querySelector('.menu-toggle');
const desktopNav = document.querySelector('.desktop-nav');
const themeToggle = document.querySelector('.theme-toggle');
const body = document.body;
const toast = document.querySelector('.toast');

menuToggle?.addEventListener('click', () => {
  const isOpen = desktopNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Đóng menu' : 'Mở menu');
});

desktopNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    desktopNav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

themeToggle?.addEventListener('click', () => {
  const isLight = body.classList.toggle('light-contrast');
  themeToggle.setAttribute('aria-pressed', String(isLight));
  const label = themeToggle.querySelector('.toggle-label');
  if (label) label.textContent = isLight ? 'Light view' : 'Contrast';
});

document.querySelectorAll('.swatch').forEach((swatch) => {
  swatch.addEventListener('click', async () => {
    const value = swatch.dataset.color;
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${value} copied`);
    } catch {
      showToast(value);
    }
  });
});

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}
