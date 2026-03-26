/**
 * format.js — Minza Health Format Utilities
 *
 * Pure formatting functions. No side effects. No DOM.
 */

// ─── DATE ──────────────────────────────────────────────────────────────────────
function fmtDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

function fmtDateTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return fmtDate(isoString);
}

// ─── CURRENCY ──────────────────────────────────────────────────────────────────
function fmtUGX(amount) {
  if (amount === null || amount === undefined) return '—';
  return 'UGX ' + Number(amount).toLocaleString('en-UG');
}

// ─── AGE ───────────────────────────────────────────────────────────────────────
function fmtAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  const now   = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age}y`;
}

// ─── SECURITY ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export { fmtDate, fmtDateTime, fmtTime, fmtRelative, fmtUGX, fmtAge, escapeHtml };