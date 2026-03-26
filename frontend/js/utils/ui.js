/**
 * ui.js — Minza Health UI Utilities
 *
 * Reusable DOM helpers. No business logic here.
 *  - Toast notifications
 *  - Modal open/close
 *  - Connectivity pill
 *  - Loading states
 *  - Form helpers
 */

import { onConnChange, getConnState } from '../services/api.js';

// ─── TOAST ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className   = `toast toast--${type} toast--visible`;

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 3500);
}

// ─── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('modal--open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('modal--open');
}

// Close on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('modal--open');
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal--open').forEach(m => m.classList.remove('modal--open'));
  }
});

// ─── CONNECTIVITY PILL ─────────────────────────────────────────────────────────
function initConnPill(pillId = 'conn-pill') {
  const pill = document.getElementById(pillId);
  if (!pill) return;

  function update(state) {
    const map = {
      online:  { cls: 'conn-pill--online',  label: 'Online' },
      offline: { cls: 'conn-pill--offline', label: 'Offline' },
      syncing: { cls: 'conn-pill--syncing', label: 'Syncing…' },
    };
    const { cls, label } = map[state] || map.online;
    pill.className = `conn-pill ${cls}`;

    const dot = '<span class="conn-dot"></span>';
    pill.innerHTML = dot + label;
  }

  // Set initial state
  update(getConnState() ? 'online' : 'offline');

  // Subscribe to changes from the API service
  onConnChange(update);
}

// ─── LOADING ───────────────────────────────────────────────────────────────────
function setLoading(container, isLoading, message = 'Loading…') {
  if (!container) return;
  if (isLoading) {
    container.innerHTML = `<tr><td colspan="99" class="loading">${message}</td></tr>`;
  }
}

function setButtonLoading(btn, isLoading, loadingText = 'Loading…', defaultText = null) {
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = loadingText;
  } else {
    btn.textContent = defaultText || btn.dataset.originalText || 'Submit';
  }
}

// ─── FORM HELPERS ──────────────────────────────────────────────────────────────
function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function showFormError(form, message) {
  if (!form) return;
  const errEl = form.querySelector('.form-error');
  if (errEl) {
    errEl.textContent = message;
    errEl.style.display = 'block';
  } else {
    showToast(message, 'error');
  }
}

function getFormData(form) {
  if (!form) return {};
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

// ─── PAGE TITLE ────────────────────────────────────────────────────────────────
function setPageTitle(title) {
  document.title = `${title} — Minza Health`;
  const h1 = document.querySelector('.page-title');
  if (h1) h1.textContent = title;
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export {
  showToast,
  openModal,
  closeModal,
  initConnPill,
  setLoading,
  setButtonLoading,
  clearFormErrors,
  showFormError,
  getFormData,
  setPageTitle,
};