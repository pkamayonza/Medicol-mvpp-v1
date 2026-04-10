/**
 * api.js — Minza Health API Service Layer
 * =========================================
 * ALL fetch/data calls go through apiRequest().
 * In stub mode, returns realistic mock data.
 * Swap STUB_MODE to false and set API_BASE to go live.
 */
 
export const STUB_MODE = true;
export const API_BASE  = 'https://qflqwmfdwalvmndaojzl.supabase.co/rest/v1';
export const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmbHF3bWZkd2Fsdm1uZGFvanpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjcxMTcsImV4cCI6MjA4NzIwMzExN30.Ewpo8PoGq6PGcHnN85aYCUdPtSv7RXoGh9qthBJHezA';
 
// ── OFFLINE QUEUE ─────────────────────────────────────────────────
let _isOnline = navigator.onLine;
window.addEventListener('online',  () => { _isOnline = true;  _emit('online');  });
window.addEventListener('offline', () => { _isOnline = false; _emit('offline'); });
 
const _listeners = [];
export function onConnChange(fn) { _listeners.push(fn); }
export function getConnState()   { return _isOnline; }
function _emit(s) { _listeners.forEach(fn => fn(s)); }
 
// ── SESSION ───────────────────────────────────────────────────────
export function getSession()       { try { return JSON.parse(localStorage.getItem('minza_sess')); } catch { return null; } }
export function setSession(d)      { localStorage.setItem('minza_sess', JSON.stringify(d)); }
export function clearSession()     { localStorage.removeItem('minza_sess'); }
export function getToken()         { return getSession()?.access_token || null; }
 
// ── MOCK DATA STORE ───────────────────────────────────────────────
// Shared in-memory store so all modules see the same state in stub mode
export const DB = {
  patients: [
    { id: 'p1', org_id: 'org1', full_name: 'Grace Nakato',  phone: '0701234567', gender: 'female', dob: '1992-04-15', created_at: new Date(Date.now() - 86400000*10).toISOString() },
    { id: 'p2', org_id: 'org1', full_name: 'James Ssemba',  phone: '0782345678', gender: 'male',   dob: '1985-08-22', created_at: new Date(Date.now() - 86400000*5).toISOString()  },
    { id: 'p3', org_id: 'org1', full_name: 'Fatima Abubakar',phone: '0755678901', gender: 'female', dob: '2001-01-09', created_at: new Date(Date.now() - 86400000*2).toISOString()  },
  ],
  visits: [
    { id: 'v1', org_id: 'org1', patient_id: 'p1', status: 'waiting',    doctor_id: null,  created_at: new Date(Date.now() - 3600000*2).toISOString() },
    { id: 'v2', org_id: 'org1', patient_id: 'p2', status: 'in_consult', doctor_id: 'u2',  created_at: new Date(Date.now() - 3600000*1).toISOString() },
    { id: 'v3', org_id: 'org1', patient_id: 'p3', status: 'completed',  doctor_id: 'u2',  created_at: new Date(Date.now() - 3600000*3).toISOString() },
  ],
  consultations: [
    { id: 'c1', visit_id: 'v2', symptoms: 'Fever, headache, joint pain', diagnosis: 'Malaria — confirmed by RDT', notes: 'Patient has been symptomatic for 3 days. RDT positive.', created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 'c2', visit_id: 'v3', symptoms: 'Cough, sore throat', diagnosis: 'Upper respiratory tract infection', notes: 'Mild case. Advised rest and fluids.', created_at: new Date(Date.now() - 3600000*3).toISOString() },
  ],
  prescriptions: [
    { id: 'rx1', visit_id: 'v2', status: 'pending', created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 'rx2', visit_id: 'v3', status: 'dispensed', created_at: new Date(Date.now() - 3600000*2).toISOString() },
  ],
  prescription_items: [
    { id: 'ri1', prescription_id: 'rx1', drug_name: 'Coartem 20/120mg', dosage: '4 tabs BD x 3 days', quantity: 24, price: 12000 },
    { id: 'ri2', prescription_id: 'rx1', drug_name: 'Paracetamol 500mg', dosage: '2 tabs QID PRN', quantity: 24, price: 2400 },
    { id: 'ri3', prescription_id: 'rx2', drug_name: 'Amoxicillin 500mg', dosage: '1 cap TDS x 5 days', quantity: 15, price: 9000 },
  ],
  pharmacy_orders: [
    { id: 'po1', prescription_id: 'rx1', clinic_id: 'org1', pharmacy_id: 'org1', order_type: 'internal', status: 'sent',      created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 'po2', prescription_id: 'rx2', clinic_id: 'org1', pharmacy_id: 'org1', order_type: 'internal', status: 'dispensed', created_at: new Date(Date.now() - 3600000*2).toISOString() },
  ],
  bills: [
    { id: 'b1', visit_id: 'v2', total_amount: 14400, status: 'unpaid', created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 'b2', visit_id: 'v3', total_amount: 9000,  status: 'paid',   created_at: new Date(Date.now() - 3600000*2).toISOString() },
  ],
  payments: [
    { id: 'pay1', bill_id: 'b2', amount: 9000, method: 'cash', status: 'success', reference: null, created_at: new Date(Date.now() - 3600000*2).toISOString() },
  ],
  users: [
    { id: 'u1', email: 'reception@clinic.com', role: 'receptionist', name: 'Sarah Namukwaya', org_id: 'org1' },
    { id: 'u2', email: 'doctor@clinic.com',    role: 'doctor',       name: 'Dr. Alex Kato',  org_id: 'org1' },
    { id: 'u3', email: 'pharmacy@clinic.com',  role: 'pharmacist',   name: 'Mercy Atim',     org_id: 'org1' },
    { id: 'u4', email: 'admin@clinic.com',     role: 'admin',        name: 'John Mwangi',    org_id: 'org1' },
  ],
};
 
// ── STUB ROUTER ───────────────────────────────────────────────────
function stubRoute(endpoint, method, payload) {
  const url = endpoint.split('?')[0];
  const qs  = endpoint.includes('?') ? new URLSearchParams(endpoint.split('?')[1]) : null;
 
  const delay = () => new Promise(r => setTimeout(r, 120 + Math.random() * 160));
 
  // ─ Auth ─────────────────────────────────────────────────────────
  if (url === '/auth/login') {
    const user = DB.users.find(u => u.email === payload?.email);
    if (!user || payload?.password !== 'minza123') {
      return delay().then(() => { throw new Error('Invalid email or password.'); });
    }
    const sess = {
      access_token: 'stub_token_' + user.id,
      user: { id: user.id, email: user.email, user_metadata: { org_name: 'Minza Demo Clinic', org_id: 'org1', role: user.role, name: user.name } },
    };
    return delay().then(() => sess);
  }
 
  // ─ Patients ─────────────────────────────────────────────────────
  if (url === '/patients' && method === 'GET') {
    let list = DB.patients;
    const q = qs?.get('search');
    if (q) list = list.filter(p => p.full_name.toLowerCase().includes(q.toLowerCase()) || (p.phone||'').includes(q));
    return delay().then(() => list);
  }
  if (url === '/patients' && method === 'POST') {
    const p = { id: 'p' + Date.now(), org_id: 'org1', created_at: new Date().toISOString(), ...payload };
    DB.patients.unshift(p);
    return delay().then(() => p);
  }
  if (url.startsWith('/patients/') && method === 'PATCH') {
    const id = url.split('/')[2];
    const idx = DB.patients.findIndex(p => p.id === id);
    if (idx >= 0) Object.assign(DB.patients[idx], payload);
    return delay().then(() => DB.patients[idx]);
  }
 
  // ─ Visits ───────────────────────────────────────────────────────
  if (url === '/visits' && method === 'GET') {
    const today = new Date(); today.setHours(0,0,0,0);
    let list = DB.visits.filter(v => new Date(v.created_at) >= today);
    const doctorId = qs?.get('doctor_id');
    if (doctorId) list = list.filter(v => v.doctor_id === doctorId || v.status === 'in_consult');
    // Join patients
    list = list.map(v => ({
      ...v,
      patients: DB.patients.find(p => p.id === v.patient_id) || null,
    }));
    return delay().then(() => list);
  }
  if (url === '/visits' && method === 'POST') {
    const v = { id: 'v' + Date.now(), org_id: 'org1', doctor_id: null, created_at: new Date().toISOString(), ...payload };
    DB.visits.push(v);
    return delay().then(() => v);
  }
  if (url.startsWith('/visits/') && method === 'PATCH') {
    const id = url.split('/')[2];
    const idx = DB.visits.findIndex(v => v.id === id);
    if (idx >= 0) Object.assign(DB.visits[idx], payload);
    return delay().then(() => DB.visits[idx]);
  }
  if (url.startsWith('/visits/') && method === 'GET') {
    const id = url.split('/')[2];
    const v = DB.visits.find(v => v.id === id);
    if (!v) return delay().then(() => null);
    return delay().then(() => ({
      ...v,
      patients:      DB.patients.find(p => p.id === v.patient_id) || null,
      consultations: DB.consultations.filter(c => c.visit_id === v.id),
      prescriptions: DB.prescriptions.filter(rx => rx.visit_id === v.id).map(rx => ({
        ...rx,
        prescription_items: DB.prescription_items.filter(i => i.prescription_id === rx.id),
      })),
    }));
  }
 
  // ─ Consultations ────────────────────────────────────────────────
  if (url === '/consultations' && method === 'POST') {
    const c = { id: 'c' + Date.now(), created_at: new Date().toISOString(), ...payload };
    DB.consultations.push(c);
    // update visit status
    const vi = DB.visits.findIndex(v => v.id === payload.visit_id);
    if (vi >= 0) DB.visits[vi].status = 'in_consult';
    return delay().then(() => c);
  }
  if (url.startsWith('/consultations/') && method === 'PATCH') {
    const id = url.split('/')[2];
    const idx = DB.consultations.findIndex(c => c.id === id);
    if (idx >= 0) Object.assign(DB.consultations[idx], payload);
    return delay().then(() => DB.consultations[idx]);
  }
 
  // ─ Prescriptions ────────────────────────────────────────────────
  if (url === '/prescriptions' && method === 'POST') {
    const rx = { id: 'rx' + Date.now(), status: 'pending', created_at: new Date().toISOString(), ...payload };
    DB.prescriptions.push(rx);
    return delay().then(() => rx);
  }
  if (url === '/prescription_items' && method === 'POST') {
    const items = Array.isArray(payload) ? payload : [payload];
    const created = items.map(i => ({ id: 'ri' + Date.now() + Math.random(), ...i }));
    DB.prescription_items.push(...created);
    return delay().then(() => created);
  }
 
  // ─ Pharmacy Orders ───────────────────────────────────────────────
  if (url === '/pharmacy_orders' && method === 'GET') {
    const statusF = qs?.get('status');
    let orders = DB.pharmacy_orders;
    if (statusF) orders = orders.filter(o => o.status === statusF);
    orders = orders.map(o => {
      const rx = DB.prescriptions.find(r => r.id === o.prescription_id) || {};
      const rxItems = DB.prescription_items.filter(i => i.prescription_id === rx.id);
      const visit = DB.visits.find(v => v.id === rx.visit_id) || {};
      const patient = DB.patients.find(p => p.id === visit.patient_id) || {};
      return { ...o, prescriptions: { ...rx, prescription_items: rxItems, visits: { ...visit, patients: patient } } };
    });
    return delay().then(() => orders);
  }
  if (url === '/pharmacy_orders' && method === 'POST') {
    const o = { id: 'po' + Date.now(), status: 'sent', created_at: new Date().toISOString(), ...payload };
    DB.pharmacy_orders.push(o);
    return delay().then(() => o);
  }
  if (url.startsWith('/pharmacy_orders/') && method === 'PATCH') {
    const id = url.split('/')[2];
    const idx = DB.pharmacy_orders.findIndex(o => o.id === id);
    if (idx >= 0) Object.assign(DB.pharmacy_orders[idx], payload);
    if (payload.status === 'dispensed') {
      const rxId = DB.pharmacy_orders[idx].prescription_id;
      const rxi = DB.prescriptions.findIndex(r => r.id === rxId);
      if (rxi >= 0) DB.prescriptions[rxi].status = 'dispensed';
      const vi = DB.visits.findIndex(v => v.id === DB.prescriptions[rxi]?.visit_id);
      if (vi >= 0) DB.visits[vi].status = 'completed';
    }
    return delay().then(() => DB.pharmacy_orders[idx]);
  }
 
  // ─ Bills ────────────────────────────────────────────────────────
  if (url === '/bills' && method === 'GET') {
    const visitId = qs?.get('visit_id');
    let list = DB.bills;
    if (visitId) list = list.filter(b => b.visit_id === visitId);
    list = list.map(b => ({
      ...b,
      payments: DB.payments.filter(p => p.bill_id === b.id),
    }));
    return delay().then(() => list);
  }
  if (url === '/bills' && method === 'POST') {
    // prevent duplicate
    const existing = DB.bills.find(b => b.visit_id === payload.visit_id);
    if (existing) return delay().then(() => existing);
    const b = { id: 'b' + Date.now(), status: 'unpaid', created_at: new Date().toISOString(), ...payload };
    DB.bills.push(b);
    return delay().then(() => b);
  }
  if (url.startsWith('/bills/') && method === 'PATCH') {
    const id = url.split('/')[2];
    const idx = DB.bills.findIndex(b => b.id === id);
    if (idx >= 0) Object.assign(DB.bills[idx], payload);
    return delay().then(() => DB.bills[idx]);
  }
 
  // ─ Payments ─────────────────────────────────────────────────────
  if (url === '/payments' && method === 'POST') {
    const pay = { id: 'pay' + Date.now(), status: 'success', created_at: new Date().toISOString(), ...payload };
    DB.payments.push(pay);
    // recalculate bill status
    const bi = DB.bills.findIndex(b => b.id === payload.bill_id);
    if (bi >= 0) {
      const paid = DB.payments.filter(p => p.bill_id === payload.bill_id && p.status === 'success')
        .reduce((s, p) => s + Number(p.amount), 0);
      const total = Number(DB.bills[bi].total_amount);
      DB.bills[bi].status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    }
    return delay().then(() => pay);
  }
 
  // ─ Stats ────────────────────────────────────────────────────────
  if (url === '/stats' && method === 'GET') {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayVisits = DB.visits.filter(v => new Date(v.created_at) >= today);
    const revenue = DB.payments.filter(p => p.status === 'success' && new Date(p.created_at) >= today)
      .reduce((s, p) => s + Number(p.amount), 0);
    return delay().then(() => ({
      total_visits:    todayVisits.length,
      waiting:         todayVisits.filter(v => v.status === 'waiting').length,
      in_consult:      todayVisits.filter(v => v.status === 'in_consult').length,
      completed:       todayVisits.filter(v => v.status === 'completed').length,
      pending_rx:      DB.pharmacy_orders.filter(o => o.status === 'sent').length,
      revenue_today:   revenue,
      total_patients:  DB.patients.length,
    }));
  }
 
  // ─ Users ────────────────────────────────────────────────────────
  if (url === '/users' && method === 'GET') {
    return delay().then(() => DB.users);
  }
  if (url === '/users' && method === 'POST') {
    const u = { id: 'u' + Date.now(), org_id: 'org1', created_at: new Date().toISOString(), ...payload };
    DB.users.push(u);
    return delay().then(() => u);
  }
 
  return delay().then(() => ({ error: 'Not found', endpoint, method }));
}
 
// ── CORE REQUEST ──────────────────────────────────────────────────
export async function apiRequest(endpoint, method = 'GET', payload = null) {
  if (STUB_MODE) {
    return stubRoute(endpoint, method, payload);
  }
 
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Prefer': 'return=representation',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
 
  const config = { method, headers };
  if (payload && method !== 'GET') config.body = JSON.stringify(payload);
 
  if (!_isOnline) return [];
 
  try {
    const res  = await fetch(`${API_BASE}${endpoint}`, config);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.hint || data.error || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === 'TypeError') { _isOnline = false; _emit('offline'); return []; }
    throw err;
  }
}
 
// ── AUTH REQUEST ──────────────────────────────────────────────────
export async function authLogin(email, password) {
  return apiRequest('/auth/login', 'POST', { email, password });
}
