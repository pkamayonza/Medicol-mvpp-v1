/**
 * auth.js is Minza Health's Auth Module
 *
 * Responsibilities (ONE):
 *  - Login / logout
 *  - Session persistence
 *  - Route protection (redirect to login if no session)
 *  - Expose current user to other modules
 */

import { authRequest, apiRequest, setSession, clearSession, getSession } from '../services/api.js';

//CURRENT USER STATE
let _currentUser   = null;
let _currentSession = null;

function getCurrentUser()    { return _currentUser; }
function getCurrentSession() { return _currentSession; }

function getOrgId() {
  return _currentUser?.user_metadata?.org_id
      || _currentUser?.id
      || null;
}

function getOrgType() {
  return (_currentUser?.user_metadata?.org_type || 'clinic').toLowerCase();
}

function getRole() {
  return _currentUser?.user_metadata?.role || 'admin';
}

//LOGIN
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
    // Best-effort server logout — don't block on failure
    try {
      await fetch('https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1/logout', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
    } catch (_) { /* ignore */ }
  }
  _currentUser    = null;
  _currentSession = null;
  clearSession();
  window.location.href = '/pages/login.html';
}

// RESTORE SESSION
/**
 * Attempts to restore a persisted session using the refresh token.
 * Call this at the top of every protected page.
 * Returns the user object or null.
 */
async function restoreSession() {
  const stored = getSession();
  if (!stored?.refresh_token) return null;

  try {
    const res = await fetch(
      'https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1/token?grant_type=refresh_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA',
        },
        body: JSON.stringify({ refresh_token: stored.refresh_token }),
      }
    );

    if (!res.ok) {
      clearSession();
      return null;
    }

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

// ROUTE PROTECTION
/**
 * protectRoute calls at top of every protected page.
 * Restores session, redirects to login if none.
 * Returns user object on success.
 */
async function protectRoute() {
  const user = await restoreSession();
  if (!user) {
    window.location.href = '/pages/login.html';
    return null;
  }
  return user;
}

/**
 * redirectIfLoggedIn calls on login.html.
 * If already logged in, skip to dashboard.
 */
async function redirectIfLoggedIn() {
  const stored = getSession();
  if (!stored?.refresh_token) return;
  const user = await restoreSession();
  if (user) {
    const orgType = getOrgType();
    window.location.href = orgType === 'pharmacy'
      ? '/pages/pharmacy.html'
      : '/pages/dashboard.html';
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
  getRole,
};