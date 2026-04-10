/**
 * ui.js — UI utilities: toast, modal, connectivity pill, states
 */
 
import { onConnChange, getConnState } from '../services/api.js';
 
// ── TOAST ─────────────────────────────────────────────────────────
let _toastContainer = null;
 
function _getContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'toast-container';
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}
 
export function showToast(message, type = 'success', duration = 3500) {
  const container = _getContainer();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
 
  const icons = { success: '✓', error: '✕', warn: '⚠' };
  el.innerHTML = `<span>${icons[type] || '·'}</span><span>${message}</span>`;
 
  container.appendChild(el);
  const timer = setTimeout(() => {
    el.style.animation = 'none';
    el.style.opacity   = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'opacity 0.25s, transform 0.25s';
    setTimeout(() => el.remove(), 280);
  }, duration);
 
  el.addEventListener('click', () => { clearTimeout(timer); el.remove(); });
}
 
// ── MODAL ─────────────────────────────────────────────────────────
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('modal--open'); el.style.display = 'flex'; }
}
 
export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('modal--open'); el.style.display = ''; }
}
 
// Backdrop click closes modal
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) closeModal(e.target.id);
});
 
// Escape closes all modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal--open').forEach(m => {
      m.classList.remove('modal--open');
      m.style.display = '';
    });
  }
});
 
// ── CONNECTIVITY PILL ─────────────────────────────────────────────
export function initConnPill(id = 'conn-pill') {
  const el = document.getElementById(id);
  if (!el) return;
 
  function update(state) {
    const map = {
      online:  { cls: 'conn-pill--online',  label: 'Online'    },
      offline: { cls: 'conn-pill--offline', label: 'Offline'   },
      syncing: { cls: 'conn-pill--syncing', label: 'Syncing\u2026' },
    };
    const { cls, label } = map[state] || map.online;
    el.className   = `conn-pill ${cls}`;
    el.innerHTML   = `<span class="conn-dot"></span>${label}`;
  }
 
  update(getConnState() ? 'online' : 'offline');
  onConnChange(update);
}
 
// ── LOADING STATES ────────────────────────────────────────────────
export function setLoading(container, show, colspan = 6) {
  if (!container || !show) return;
  const isTable = container.tagName === 'TBODY';
  if (isTable) {
    container.innerHTML = `<tr><td colspan="${colspan}">
      <div class="state-loading">
        <div class="state-loading__spinner"></div>
        <span class="text-muted text-sm">Loading\u2026</span>
      </div>
    </td></tr>`;
  } else {
    container.innerHTML = `<div class="state-loading">
      <div class="state-loading__spinner"></div>
      <span class="text-muted text-sm">Loading\u2026</span>
    </div>`;
  }
}
 
export function setEmpty(container, { icon = '📋', title = 'Nothing here', sub = '' } = {}, colspan = 6) {
  if (!container) return;
  const isTable = container.tagName === 'TBODY';
  const inner = `<div class="state-empty">
    <div class="state-empty__icon">${icon}</div>
    <div class="state-empty__title">${title}</div>
    ${sub ? `<div class="state-empty__sub">${sub}</div>` : ''}
  </div>`;
  if (isTable) container.innerHTML = `<tr><td colspan="${colspan}">${inner}</td></tr>`;
  else container.innerHTML = inner;
}
 
export function setError(container, message, colspan = 6) {
  if (!container) return;
  const isTable = container.tagName === 'TBODY';
  const inner = `<div class="state-error">
    <div class="state-error__icon">⚠️</div>
    <div class="state-empty__title">Something went wrong</div>
    <div class="state-empty__sub text-danger">${message}</div>
  </div>`;
  if (isTable) container.innerHTML = `<tr><td colspan="${colspan}">${inner}</td></tr>`;
  else container.innerHTML = inner;
}
 
// ── BUTTON LOADING ────────────────────────────────────────────────
export function btnLoading(btn, loading, loadingText = 'Loading\u2026') {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._originalText = btn.textContent;
    btn.textContent   = loadingText;
  } else {
    btn.textContent   = btn._originalText || 'Submit';
  }
}
 
// ── BIND CLOSE BUTTONS ────────────────────────────────────────────
export function bindCloseButtons() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
}
 
// ── ACTIVE NAV LINK ───────────────────────────────────────────────
export function markActiveNav() {
  const current = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav__link').forEach(a => {
    const href = a.getAttribute('href')?.split('/').pop();
    if (href && href === current) a.classList.add('nav__link--active');
  });
}
