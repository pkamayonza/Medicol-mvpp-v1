/**
 * auth.js — Session management, role protection, redirects
 */
 
import { authLogin, getSession, setSession, clearSession } from '../services/api.js';
 
let _user = null;
 
export function getCurrentUser() { return _user; }
export function getRole()        { return _user?.user_metadata?.role || null; }
export function getOrgId()       { return _user?.user_metadata?.org_id || _user?.id || null; }
export function getOrgName()     { return _user?.user_metadata?.org_name || _user?.email || '—'; }
export function getUserName()    { return _user?.user_metadata?.name || _user?.email || '—'; }
 
// ── LOGIN ──────────────────────────────────────────────────────────
export async function login(email, password) {
  const data = await authLogin(email, password);
  _user = data.user;
  setSession(data);
  return data;
}
 
// ── LOGOUT ─────────────────────────────────────────────────────────
export function logout() {
  _user = null;
  clearSession();
  window.location.href = 'login.html';
}
 
// ── RESTORE SESSION ────────────────────────────────────────────────
export function restoreSession() {
  const sess = getSession();
  if (!sess?.user) return null;
  _user = sess.user;
  return _user;
}
 
// ── ROUTE PROTECTION ───────────────────────────────────────────────
/**
 * Call at top of every protected page.
 * allowedRoles: null = any authenticated user, or array of roles e.g. ['doctor','admin']
 * Returns user or redirects to login.
 */
export function protectRoute(allowedRoles = null) {
  const user = restoreSession();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(getRole())) {
    // Redirect to role-appropriate home
    window.location.href = roleHome(getRole());
    return null;
  }
  return user;
}
 
// ── ROLE → HOME PAGE ───────────────────────────────────────────────
export function roleHome(role) {
  const map = {
    receptionist: 'queue.html',
    doctor:       'doctor-queue.html',
    pharmacist:   'pharmacy-queue.html',
    admin:        'admin.html',
  };
  return map[role] || 'login.html';
}
 
// ── REDIRECT IF LOGGED IN ─────────────────────────────────────────
export function redirectIfLoggedIn() {
  const user = restoreSession();
  if (user) window.location.href = roleHome(getRole());
}
 