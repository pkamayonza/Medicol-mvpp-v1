import { authRequest, setSession, clearSession, getSession } from '../services/api.js';

let _currentUser    = null;
let _currentSession = null;

function getCurrentUser()    { return _currentUser; }
function getCurrentSession() { return _currentSession; }

export function getOrgName() {
  // Retrieve from localStorage after login
  return localStorage.getItem('orgName') || 'Your Clinic';
}

export function getOrgType() {
  return localStorage.getItem('orgType') || 'clinic';
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
async function signup(email, password, orgName, orgType) {
  const data = await authRequest('signup', {
    email,
    password,
    data: {
      org_name:    orgName,
      org_type:    orgType,
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
    } catch (_) { /* best-effort */ }
  }
  _currentUser    = null;
  _currentSession = null;
  clearSession();
  window.location.href = 'login.html'; // ← relative, not /pages/login.html
}

// RESTORE SESSION 
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

// ROUTE PROTECTION 
async function protectRoute() {
  const user = await restoreSession();
  if (!user) {
    window.location.href = 'login.html'; // ← relative
    return null;
  }
  return user;
}

async function redirectIfLoggedIn() {
  const stored = getSession();
  if (!stored?.refresh_token) return;
  const user = await restoreSession();
  if (user) {
    window.location.href = getOrgType() === 'pharmacy'
      ? 'pharmacy.html'   // ← relative
      : 'dashboard.html'; // ← relative
  }
}

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