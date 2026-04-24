/**
 * api.js — Minza Health API Service Layer
 * =========================================
 * ALL fetch/data calls go through apiRequest().
 * In stub mode, returns realistic mock data.
 * Swap STUB_MODE to false and set API_BASE to go live.
 */
 
// 🚨 TURN OFF STUB MODE
export const STUB_MODE = false;

// ✅ POINT TO YOUR FASTAPI BACKEND
export const API_BASE = 'http://127.0.0.1:8000';

// ❌ REMOVE SUPABASE KEY (not needed anymore)
export const ANON_KEY = null;

// CONNECTION STATE 
let _isOnline = navigator.onLine;

const _listeners = [];

window.addEventListener('online', () => {
  _isOnline = true;
  _listeners.forEach(fn => fn('online'));
});

window.addEventListener('offline', () => {
  _isOnline = false;
  _listeners.forEach(fn => fn('offline'));
});

export function getConnState() {
  return _isOnline;
}

export function onConnChange(fn) {
  _listeners.push(fn);
}

// SESSION 
export function getSession() {
  try { return JSON.parse(localStorage.getItem('minza_sess')); }
  catch { return null; }
}

export function setSession(d) {
  localStorage.setItem('minza_sess', JSON.stringify(d));
}

export function clearSession() {
  localStorage.removeItem('minza_sess');
}

export function getToken() {
  return getSession()?.access_token || null;
}

// CORE REQUEST 
export async function apiRequest(endpoint, method = 'GET', payload = null) {

  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = { method, headers };

  if (payload && method !== 'GET') {
    config.body = JSON.stringify(payload);
  }

  console.log("API CALL:", `${API_BASE}${endpoint}`);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);

    if (res.status === 204) return null;

    const data = await res.json();

    if (!res.ok) {
      console.error("API ERROR:", data);
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }

    return data;

  } catch (err) {
  console.error("FETCH FAILED:", err);
  throw err;
  }
}

// AUTH 
export async function authLogin(email, password) {
  return apiRequest('/auth/login', 'POST', { email, password });
}

export function getConnState() {
  return _isOnline;
}

export function onConnChange(fn) {
  // optional: keep it simple for now
}



