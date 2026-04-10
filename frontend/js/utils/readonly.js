import { getUserRole } from '../modules/auth.js';

/**
 * Apply read-only restrictions for admin users.
 * Call this after the page has fully rendered.
 */
export function applyReadOnlyMode() {
  const role = getUserRole();
  if (role !== 'admin') return;

  console.log('[Minza] Admin read-only mode active');

  // 1. Disable all form controls
  document.querySelectorAll('input, select, textarea, button').forEach(el => {
    if (el.closest('nav')) return;          // keep navigation functional
    if (el.id === 'logout-btn') return;     // allow sign out
    if (el.dataset.ignoreReadonly === 'true') return;

    el.disabled = true;
    if (el.tagName === 'BUTTON') {
      el.style.opacity = '0.6';
      el.style.cursor = 'not-allowed';
    }
  });

  // 2. Block form submissions
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Read‑only mode: Admin cannot perform actions.');
    }, { once: true });
  });

  // 3. Block action buttons that use [data-action]
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      alert('Read‑only mode: Admin cannot perform this action.');
    }, { once: true });
  });

  // 4. Show a fixed banner
  showReadOnlyBanner();
}

function showReadOnlyBanner() {
  const banner = document.createElement('div');
  banner.textContent = '🔒 Admin Read‑Only Mode – View Only';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    background: '#ffcc00',
    color: '#000',
    textAlign: 'center',
    padding: '6px',
    fontSize: '13px',
    fontWeight: '500',
    zIndex: '9999',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  });
  document.body.prepend(banner);
}