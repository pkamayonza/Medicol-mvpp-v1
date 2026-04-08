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
 
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      if (r) { r.onsuccess = e => resolve(e.target.result); r.onerror = e => reject(e.target.error); }
      t.oncomplete = () => resolve();
      t.onerror    = e => reject(e.target.error);
    });
  };
 
  return {
    push:   e  => tx('readwrite', s => s.add(e)),
    remove: id => tx('readwrite', s => s.delete(id)),
    update: e  => tx('readwrite', s => s.put(e)),
    all:    () => new Promise(async (resolve, reject) => {
      const db = await open();
      const t  = db.transaction(STORE, 'readonly');
      const r  = t.objectStore(STORE).index('queuedAt').getAll();
      r.onsuccess = e => resolve(e.target.result);
      r.onerror   = e => reject(e.target.error);
    }),
    MAX_ATT,
  };
})();
 
// CONNECTIVITY 
let _isOnline        = navigator.onLine;
let _syncInProgress  = false;
const _connListeners = [];
 
function getConnState() { return _isOnline; }
function onConnChange(fn) { _connListeners.push(fn); }
function _emit(state)   { _connListeners.forEach(fn => fn(state)); }
 
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

  if (method === 'GET') {
    // Offline: return empty array/null instead of throwing — caller decides what to show
    if (!_isOnline) {
      console.warn('[Minza] GET skipped — offline:', endpoint);
      return opts.returnNullIfOffline ? null : [];
    }
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      // Network error on GET (e.g. request in flight when connection drops)
      if (err.name === 'TypeError') {
        _isOnline = false;
        _emitConnChange('offline');
        return opts.returnNullIfOffline ? null : [];
      }
      throw err;
    }
  }

  // Mutations: try live first, queue on failure
  if (_isOnline) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        // Network dropped mid-request — fall through to queue
        _isOnline = false;
        _emitConnChange('offline');
      } else {
        throw err; // Server rejected it (4xx/5xx) — surface to caller
      }
    }
  }

  // Offline — queue the mutation
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
  console.log('[Minza] Queued offline mutation:', method, endpoint);
  return null;
}
 
  // MUTATIONS: try live, queue on network failure
  if (_isOnline) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      if (err.name === 'TypeError') {
        // Network dropped — fall through to queue
        _isOnline = false;
        _emit('offline');
      } else {
        // Server rejected (4xx/5xx) — surface to caller, do not queue
        throw err;
      }
    }
  }
 
  // OFFLINE QUEUE
  const entry = {
    id:       crypto.randomUUID(),
    endpoint,
    method,
    body,
    token,
    queuedAt: Date.now(),
    attempts: 0,
  };
  await OfflineQueue.push(entry);
  console.log('[Minza] Queued offline:', method, endpoint);
  return null; // caller must handle null gracefully
}
 
// AUTH REQUESTS
async function authRequest(path, body) {
  const res = await fetch(`${AUTH_BASE}/${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Auth failed');
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
        console.log('[Minza] Drained:', item.endpoint);
      } else if (res.status >= 400 && res.status < 500) {
        // Server permanently rejected — discard to avoid infinite loop
        await OfflineQueue.remove(item.id);
        console.warn('[Minza] Queue item rejected by server:', res.status, item.endpoint);
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
      // Network dropped again during drain
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
 
// Drain on load if online; retry every 60 s
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