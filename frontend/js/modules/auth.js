import { authRequest, setSession, clearSession, getSession } from '../services/api.js';

let _currentUser    = null;
let _currentSession = null;

function getCurrentUser()    { return _currentUser; }
function getCurrentSession() { return _currentSession; }

// ONLY ONE definition of each — reads from the live session object
function getOrgId() {
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
 
// SIGNUP 
/**
 * signup — creates a new Supabase Auth user.
 * org_name and org_type are stored in user_metadata and used throughout the app.
 */
async function signup(email, password, orgName, orgType) {
  const data = await authRequest('signup', {
    email,
    password,
    data: {
      org_name:    orgName,
      org_type:    orgType || 'clinic',
      trial_start: new Date().toISOString(),
      trial_days:  14,
    },
  });
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
    } catch (_) { /* best-effort — don't block the user */ }
  }
  _currentUser    = null;
  _currentSession = null;
  clearSession();
  window.location.href = 'login.html'; // ← RELATIVE — no leading slash
}
 
// RESTORE SESSION 
/**
 * Attempts to restore a persisted session using the stored refresh_token.
 * Returns the user object on success, null on any failure.
 * Does NOT redirect — callers decide what to do with a null result.
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
    // Network down or Supabase unreachable — clear so we don't loop
    clearSession();
    return null;
  }
}
 
// ROUTE PROTECTION 
/**
 * protectRoute — await this at the top of every protected page.
 * On success: returns the user object and execution continues normally.
 * On failure: redirects to login.html and returns null.
 *             The caller should check for null and stop execution.
 */
async function protectRoute() {
  const user = await restoreSession();
  if (!user) {
    window.location.href = 'login.html'; // ← RELATIVE
    return null;
  }
  return user;
}
 
/**
 * redirectIfLoggedIn — call on login.html only.
 * Silently skips the login screen if the session is still valid.
 */
async function redirectIfLoggedIn() {
  const stored = getSession();
  if (!stored?.refresh_token) return;
  const user = await restoreSession();
  if (user) {
    window.location.href = getOrgType() === 'pharmacy'
      ? 'pharmacy.html'   // ← RELATIVE
      : 'dashboard.html'; // ← RELATIVE
  }
}
 
// EXPORTS 
export {
  login,
  signup,
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
 