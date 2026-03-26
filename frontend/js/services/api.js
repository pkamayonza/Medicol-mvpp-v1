/**
 * api.js — Minza Health API Service Layer
 * ALL HTTP requests go through this file. Nothing else touches fetch().
 *
 * Responsibilities:
 *  - Base URL management
 *  - JWT token injection
 *  - Centralised error handling
 *  - Offline detection + queue (IndexedDB)
 *  - Retry on reconnect
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const API_BASE = 'https://qflqwmfdwalvmndaojzl.supabase.co/rest/v1';
const AUTH_BASE = 'https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA';

// ─── OFFLINE QUEUE (IndexedDB) ─────────────────────────────────────────────────
const OfflineQueue = (() => {
  const DB_NAME = 'minza_queue';
  const DB_VER  = 1;
  const STORE   = 'mutations';
  const MAX_ATT = 3;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
      req.onerror    = e => reject(e.target.error);
    });
  }

  async function push(entry) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(entry);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function all() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('queuedAt').getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function update(entry) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }

  return { push, all, remove, update, MAX_ATT };
})();

// ─── CONNECTIVITY STATE ────────────────────────────────────────────────────────
let _isOnline = navigator.onLine;
let _syncInProgress = false;

function getConnState() { return _isOnline; }

window.addEventListener('online',  () => { _isOnline = true;  _emitConnChange('online');  drainQueue(); });
window.addEventListener('offline', () => { _isOnline = false; _emitConnChange('offline'); });

// Listeners can subscribe to connectivity changes
const _connListeners = [];
function onConnChange(fn) { _connListeners.push(fn); }
function _emitConnChange(state) { _connListeners.forEach(fn => fn(state)); }

// ─── TOKEN HELPERS ─────────────────────────────────────────────────────────────
function getToken() {
  const raw = localStorage.getItem('minza_session');
  if (!raw) return null;
  try { return JSON.parse(raw)?.access_token || null; }
  catch { return null; }
}

function getSession() {
  const raw = localStorage.getItem('minza_session');
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function setSession(data) {
  localStorage.setItem('minza_session', JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem('minza_session');
}

// ─── CORE REQUEST ──────────────────────────────────────────────────────────────
/**
 * apiRequest — the single function all modules use for data operations.
 *
 * @param {string} endpoint   - PostgREST path e.g. '/patients?org_id=eq.xxx'
 * @param {string} method     - GET | POST | PATCH | DELETE
 * @param {object|null} body  - request body for mutations
 * @param {object} opts       - { preferRepresentation: bool, count: bool }
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, method = 'GET', body = null, opts = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Prefer': opts.preferRepresentation !== false ? 'return=representation' : 'return=minimal',
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.count) headers['Prefer'] += ',count=exact';

  const config = { method, headers };
  if (body && method !== 'GET') config.body = JSON.stringify(body);

  // GETs: always live, throw if offline
  if (method === 'GET') {
    if (!_isOnline) throw new Error('You are offline. Showing cached data where available.');
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.hint || data.error || 'Request failed');
    return data;
  }

  // Mutations: try live first, queue on failure
  if (_isOnline) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || 'Request failed');
      return data;
    } catch (err) {
      // Only queue on network errors, not server errors (4xx)
      if (err.name === 'TypeError') {
        // Network down despite navigator.onLine — fall through to queue
      } else {
        throw err; // Server rejected it — surface to caller
      }
    }
  }

  // Offline or flaky network — queue the mutation
  const queued = {
    id:       crypto.randomUUID(),
    endpoint,
    method,
    body,
    token,
    queuedAt: Date.now(),
    attempts: 0,
  };
  await OfflineQueue.push(queued);
  console.log('[Minza] Queued offline mutation:', endpoint);
  return null; // Caller must handle null gracefully
}

// ─── AUTH REQUESTS (separate base URL) ────────────────────────────────────────
async function authRequest(path, body) {
  const res = await fetch(`${AUTH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Auth failed');
  return data;
}

// ─── OFFLINE DRAIN ─────────────────────────────────────────────────────────────
async function drainQueue() {
  if (_syncInProgress || !_isOnline) return;
  const items = await OfflineQueue.all();
  if (!items.length) return;

  _syncInProgress = true;
  _emitConnChange('syncing');

  for (const item of items) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Prefer': 'return=representation',
        'Authorization': `Bearer ${item.token || getToken() || ANON_KEY}`,
      };
      const opts = { method: item.method, headers };
      if (item.body) opts.body = JSON.stringify(item.body);

      const res = await fetch(`${API_BASE}${item.endpoint}`, opts);

      if (res.ok || res.status === 204) {
        await OfflineQueue.remove(item.id);
        console.log('[Minza] Drained queued mutation:', item.endpoint);
      } else if (res.status >= 400 && res.status < 500) {
        // Server permanently rejected — remove to avoid loop
        await OfflineQueue.remove(item.id);
        console.warn('[Minza] Queue item rejected by server:', item.endpoint, res.status);
      } else {
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= OfflineQueue.MAX_ATT) {
          await OfflineQueue.remove(item.id);
          console.error('[Minza] Queue item failed after max attempts:', item.endpoint);
        } else {
          await OfflineQueue.update(item);
        }
      }
    } catch (err) {
      _isOnline = false;
      _syncInProgress = false;
      _emitConnChange('offline');
      return;
    }
  }

  _syncInProgress = false;
  const remaining = await OfflineQueue.all();
  _emitConnChange(remaining.length ? 'offline' : 'online');
}

// Drain on load if online, and every 60 seconds
if (_isOnline) drainQueue();
setInterval(() => { if (_isOnline) drainQueue(); }, 60_000);

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export {
  apiRequest,
  authRequest,
  getToken,
  getSession,
  setSession,
  clearSession,
  getConnState,
  onConnChange,
  drainQueue,
};