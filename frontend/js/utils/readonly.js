/**
 * readonly.js — Admin Read-Only Mode
 * =====================================
 * When an admin navigates to a role-specific page (queue, doctor-queue,
 * pharmacy-queue) they can VIEW everything but cannot perform any action
 * that would mutate data.
 *
 * Call applyReadOnlyMode() at the bottom of each protected page's script,
 * AFTER the initial load() so the banner appears in the right place.
 *
 * What gets locked per page:
 *
 *   queue.html
 *     - Hides: #new-patient-btn, "Assign Doctor" buttons (js-assign),
 *              the entire #modal-new-patient and #modal-assign
 *
 *   doctor-queue.html
 *     - Replaces "Start Consult →" / "Continue →" links with a View-only
 *       ghost button (navigation is still allowed, but the label is neutral)
 *
 *   pharmacy-queue.html
 *     - Hides: Accept, Reject, Dispense buttons (js-accept, js-reject,
 *              js-dispense) from every row
 *     - Removes those buttons from the Order Detail modal actions too
 */
 
import { getRole } from '../modules/auth.js';
 
// CSS class we stamp on every element we hide
const HIDDEN_CLS = 'ro-hidden';
 
// Inject the one-time style rule
(function injectStyle() {
  if (document.getElementById('ro-style')) return;
  const s = document.createElement('style');
  s.id = 'ro-style';
  s.textContent = `
    .ro-hidden { display: none !important; }
 
    .ro-banner {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-left: 4px solid #1D4ED8;
      color: #1E40AF;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.6rem 1.25rem;
      border-radius: 0;
      position: sticky;
      top: 58px;        /* below the nav */
      z-index: 150;
      letter-spacing: 0.1px;
    }
 
    .ro-banner__icon { font-size: 1rem; flex-shrink: 0; }
    .ro-banner__text { flex: 1; }
    .ro-banner__role {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.9px;
      background: rgba(29,78,216,0.12);
      color: #1D4ED8;
      padding: 0.15rem 0.5rem;
      border-radius: 100px;
    }
  `;
  document.head.appendChild(s);
})();
 
/**
 * applyReadOnlyMode()
 *
 * Call once at the end of each protected page script.
 * Does nothing if the current user is NOT an admin.
 */
export function applyReadOnlyMode() {
  if (getRole() !== 'admin') return;
 
  const page = window.location.pathname.split('/').pop();
 
  // Insert the banner immediately below the nav
  _insertBanner(page);
 
  // Apply page-specific locks
  if (page === 'queue.html')          _lockQueue();
  if (page === 'doctor-queue.html')   _lockDoctorQueue();
  if (page === 'pharmacy-queue.html') _lockPharmacyQueue();
 
  // Watch for dynamically rendered rows and re-apply locks
  _watchDom(page);
}
 
// ── BANNER ────────────────────────────────────────────────────────
function _insertBanner(page) {
  if (document.querySelector('.ro-banner')) return; // already inserted
 
  const labels = {
    'queue.html':          'Receptionist View',
    'doctor-queue.html':   'Doctor View',
    'pharmacy-queue.html': 'Pharmacy View',
  };
 
  const banner = document.createElement('div');
  banner.className = 'ro-banner';
  banner.innerHTML = `
    <span class="ro-banner__icon">👁</span>
    <span class="ro-banner__text">You are viewing this page as admin. Actions are disabled.</span>
    <span class="ro-banner__role">${labels[page] || 'Staff View'}</span>
  `;
 
  // Insert right after <nav>, before <main>
  const nav  = document.querySelector('nav');
  const main = document.querySelector('main');
  if (nav && nav.nextSibling) {
    nav.parentNode.insertBefore(banner, nav.nextSibling);
  } else if (main) {
    main.parentNode.insertBefore(banner, main);
  } else {
    document.body.prepend(banner);
  }
}
 
// ── QUEUE.HTML LOCKS ──────────────────────────────────────────────
function _lockQueue() {
  // Static button: "+ New Patient"
  _hide('new-patient-btn');
 
  // Prevent modal from opening even if button were visible
  _disableModal('modal-new-patient');
  _disableModal('modal-assign');
 
  // Dynamic "Assign Doctor" buttons — handled by MutationObserver in _watchDom
}
 
// ── DOCTOR-QUEUE.HTML LOCKS ───────────────────────────────────────
function _lockDoctorQueue() {
  // No static buttons to hide here — all actions are in dynamic rows.
  // The MutationObserver in _watchDom handles each rendered row.
}
 
// ── PHARMACY-QUEUE.HTML LOCKS ─────────────────────────────────────
function _lockPharmacyQueue() {
  // Dynamic Accept/Reject/Dispense — handled by MutationObserver.
  // The modal action buttons are built dynamically in openDetail(),
  // so we intercept them via the observer too.
}
 
// ── DOM MUTATION OBSERVER ─────────────────────────────────────────
function _watchDom(page) {
  const observer = new MutationObserver(() => {
    if (page === 'queue.html')          _stripQueueActions();
    if (page === 'doctor-queue.html')   _stripDoctorActions();
    if (page === 'pharmacy-queue.html') _stripPharmacyActions();
  });
 
  // Observe the containers where dynamic content is injected
  const targets = [
    document.getElementById('queue-container'),
    document.getElementById('order-body'),
    document.getElementById('order-actions'),   // pharmacy modal footer
    document.querySelector('main'),             // fallback
  ].filter(Boolean);
 
  targets.forEach(el => observer.observe(el, { childList: true, subtree: true }));
}
 
// ── STRIP FUNCTIONS (run after every render) ──────────────────────
 
function _stripQueueActions() {
  // Hide all "Assign Doctor" buttons in queue rows
  document.querySelectorAll('.js-assign').forEach(_hide);
  // Hide "Bill" links in completed rows — admin can view billing separately
  // (we leave Bill visible since it's read-navigation, not a mutation)
}
 
function _stripDoctorActions() {
  // Replace "Start Consult →" / "Continue →" with a neutral "View" link
  // The link href is kept so admin can still read the consultation.
  document.querySelectorAll('.queue-item__actions a.btn--primary').forEach(btn => {
    if (btn.classList.contains('ro-patched')) return; // already patched
    btn.classList.add('ro-patched');
    btn.classList.remove('btn--primary');
    btn.classList.add('btn--ghost');
    btn.textContent = 'View →';
  });
}
 
function _stripPharmacyActions() {
  // Hide Accept, Reject, Dispense in table rows
  document.querySelectorAll('.js-accept, .js-reject, .js-dispense').forEach(_hide);
 
  // Hide those same action buttons if they appear in the order detail modal footer
  document.querySelectorAll('#order-actions .btn--success, #order-actions .btn--danger,#order-actions .btn--primary').forEach(_hide);
}
 

// ── HELPERS ───────────────────────────────────────────────────────
 
function _hide(elOrId) {
  const el = typeof elOrId === 'string'
    ? document.getElementById(elOrId)
    : elOrId;
  if (el) el.classList.add(HIDDEN_CLS);
}
 
function _disableModal(modalId) {
  // Intercept the openModal call for this id by overriding the data-close
  // and making the trigger a no-op. Since we already hide the trigger
  // button, this is a belt-and-suspenders guard.
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.addEventListener('click', e => e.stopPropagation(), true);
 
  // Stomp any future attempt to programmatically open it
  modal._roLocked = true;
}
 