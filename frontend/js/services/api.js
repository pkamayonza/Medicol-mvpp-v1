/**
 * api.js — Minza Health API Service Layer
 * =========================================
 * ALL fetch() calls in the entire app go through this file.
 * No other file touches fetch() directly except auth.js (session refresh).
 *
 * CRITICAL BEHAVIOUR:
 *   - GET requests return [] (not throw) when offline → pages stay alive
 *   - Mutations (POST/PATCH/DELETE) are queued to IndexedDB when offline
 *   - Queue drains automatically on reconnect, FIFO, max 3 attempts each
 */
 
// CONFIG 
const API_BASE  = 'https://qflqwmfdwalvmndaojzl.supabase.co/rest/v1';
const AUTH_BASE = 'https://qflqwmfdwalvmndaojzl.supabase.co/auth/v1';
const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA';
 
// OFFLINE QUEUE (IndexedDB) 
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
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
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
 
// CONNECTIVITY 
let _isOnline        = navigator.onLine;
let _syncInProgress  = false;
const _connListeners = [];
 
function getConnState() { return _isOnline; }
function onConnChange(fn) { _connListeners.push(fn); }
function _emit(state)    { _connListeners.forEach(fn => fn(state)); }
 
window.addEventListener('online',  () => { _isOnline = true;  _emit('online');  drainQueue(); });
window.addEventListener('offline', () => { _isOnline = false; _emit('offline'); });
 
// SESSION HELPERS 
function getToken() {
  try { return JSON.parse(localStorage.getItem('minza_session'))?.access_token || null; }
  catch { return null; }
}
 
function getSession() {
  try { return JSON.parse(localStorage.getItem('minza_session')); }
  catch { return null; }
}
 
function setSession(data) {
  localStorage.setItem('minza_session', JSON.stringify(data));
}
 
function clearSession() {
  localStorage.removeItem('minza_session');
}
 
// CORE REQUEST 
/**
 * apiRequest — the single entry point for all data operations.
 *
 * @param {string}      endpoint  PostgREST path, e.g. '/patients?org_id=eq.xxx'
 * @param {string}      method    GET | POST | PATCH | DELETE  (default: GET)
 * @param {object|null} body      Mutation payload (ignored for GET)
 * @param {object}      opts      { preferRepresentation: bool, count: bool, returnNull: bool }
 * @returns {Promise<any>}
 *   - GET success  → parsed JSON array or object
 *   - GET offline  → []  (never throws — pages stay alive)
 *   - Mutation success → parsed JSON or null (204)
 *   - Mutation offline → null (queued to IndexedDB)
 *   - Server error → throws with human-readable message
 */
async function apiRequest(endpoint, method = 'GET', body = null, opts = {}) {
  const token = getToken();
 
  const headers = {
    'Content-Type': 'application/json',
    'apikey':       ANON_KEY,
    'Prefer':       opts.preferRepresentation !== false
                      ? 'return=representation'
                      : 'return=minimal',
  };
  if (token)       headers['Authorization'] = `Bearer ${token}`;
  if (opts.count)  headers['Prefer']       += ',count=exact';
 
  const config = { method, headers };
  if (body && method !== 'GET') config.body = JSON.stringify(body);
 
  // ── GET: return [] when offline so pages render empty-state instead of crash
  if (method === 'GET') {
    if (!_isOnline) {
      console.warn('[Minza] GET skipped (offline):', endpoint);
      return opts.returnNull ? null : [];
    }
    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        // Network dropped mid-flight
        _isOnline = false;
        _emit('offline');
        return opts.returnNull ? null : [];
      }
      throw err;
    }
  }
 
  // MUTATIONS: try live first 
  if (_isOnline) {
    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        _isOnline = false;
        _emit('offline');
        // Fall through to queue
      } else {
        throw err; // 4xx/5xx — surface to caller, do not queue
      }
    }
  }
 
  // QUEUE offline mutation 
  await OfflineQueue.push({
    id:       crypto.randomUUID(),
    endpoint,
    method,
    body,
    token,
    queuedAt: Date.now(),
    attempts: 0,
  });
  console.log('[Minza] Queued offline:', method, endpoint);
  return null; // caller must handle null
}
 
// AUTH REQUESTS (separate base URL, no token needed) 
async function authRequest(path, body) {
  const res = await fetch(`${AUTH_BASE}/${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Auth failed');
  return data;
}
 
// DRAIN QUEUE 
async function drainQueue() {
  if (_syncInProgress || !_isOnline) return;
  const items = await OfflineQueue.all();
  if (!items.length) return;
 
  _syncInProgress = true;
  _emit('syncing');
 
  for (const item of items) {
    try {
      const headers = {
        'Content-Type':  'application/json',
        'apikey':        ANON_KEY,
        'Prefer':        'return=representation',
        'Authorization': `Bearer ${item.token || getToken() || ''}`,
      };
      const req = { method: item.method, headers };
      if (item.body) req.body = JSON.stringify(item.body);
 
      const res = await fetch(`${API_BASE}${item.endpoint}`, req);
 
      if (res.ok || res.status === 204) {
        await OfflineQueue.remove(item.id);
      } else if (res.status >= 400 && res.status < 500) {
        await OfflineQueue.remove(item.id); // server permanently rejected
        console.warn('[Minza] Queue item rejected:', res.status, item.endpoint);
      } else {
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= OfflineQueue.MAX_ATT) {
          await OfflineQueue.remove(item.id);
          console.error('[Minza] Queue item exceeded max attempts:', item.endpoint);
        } else {
          await OfflineQueue.update(item);
        }
      }
    } catch (_) {
      _isOnline = false;
      _syncInProgress = false;
      _emit('offline');
      return;
    }
  }
 
  _syncInProgress = false;
  const remaining = await OfflineQueue.all();
  _emit(remaining.length ? 'offline' : 'online');
}
 
if (_isOnline) drainQueue();
setInterval(() => { if (_isOnline) drainQueue(); }, 60_000);
 
// EXPORTS 
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
 