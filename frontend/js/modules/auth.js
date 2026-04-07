import { authRequest, setSession, clearSession, getSession } from '../services/api.js';
 
// STATE
let _currentUser    = null;
let _currentSession = null;
 
// GETTERS
function getCurrentUser()    { return _currentUser; }
function getCurrentSession() { return _currentSession; }
 
function getOrgId() {
  // Supabase user.id IS the org identifier for single-user orgs
  return _currentUser?.user_metadata?.org_id || _currentUser?.id || null;
}
 
function getOrgType() {
  return (_currentUser?.user_metadata?.org_type || 'clinic').toLowerCase().trim();
}
 
function getOrgName() {
  return _currentUser?.user_metadata?.org_name || _currentUser?.email || '—';
}
 
function getRole() {
  return _currentUser?.user_metadata?.role || 'admin';
}
 
// LOGIN
async function login(email, password) {
  const data = await authRequest('token?grant_type=password', { email, password });
  _currentSession = data;
  _currentUser    = data.user;
  setSession(data);
  return data;
}
 
// LOGOUT
async function logout() {
  const session = getSession();
  if (session?.access_token) {
    try {
      await fetch('https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1/logout', {
        method:  'POST',
        headers: {
          'apikey':        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
    } catch (_) { /* ignore — best-effort */ }
  }
  _currentUser    = null;
  _currentSession = null;
  clearSession();
  // Use relative path — works regardless of deploy base
  window.location.href = 'login.html';
}
 
// RESTORE SESSION
/**
 * Attempts to restore a session using the stored refresh token.
 * Returns the user object on success, null on failure.
 */
async function restoreSession() {
  const stored = getSession();
  if (!stored?.refresh_token) return null;
 
  try {
    const res = await fetch(
      'https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1/token?grant_type=refresh_token',
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA',
        },
        body: JSON.stringify({ refresh_token: stored.refresh_token }),
      }
    );
 
    if (!res.ok) { clearSession(); return null; }
 
    const data = await res.json();
    _currentSession = data;
    _currentUser    = data.user;
    setSession(data);
    return data.user;
  } catch (_) {
    clearSession();
    return null;
  }
}
 
// ROUTE PRESCRIPTION
/**
 * protectRoute — call at the top of every protected page (await it).
 * Restores session silently; redirects to login if none found.
 * Returns the user object on success.
 */
async function protectRoute() {
  const user = await restoreSession();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}
 
/**
 * redirectIfLoggedIn — call on login.html.
 * Skips the login screen if session is still valid.
 */
async function redirectIfLoggedIn() {
  const stored = getSession();
  if (!stored?.refresh_token) return;
  const user = await restoreSession();
  if (user) {
    window.location.href = getOrgType() === 'pharmacy'
      ? 'pharmacy.html'
      : 'dashboard.html';
  }
}
 
// EXPORTS
export {
  login,
  logout,
  restoreSession,
  protectRoute,
  redirectIfLoggedIn,
  getCurrentUser,
  getCurrentSession,
  getOrgId,
  getOrgType,
  getOrgName,
  getRole,
};
 