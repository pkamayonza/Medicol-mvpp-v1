/**
 * dashboard.js — Minza Health Dashboard Module
 *
 * Responsibility (ONE): Fetch and render dashboard summary data.
 *  - Today's visit count
 *  - Pending prescriptions
 *  - Revenue today
 *  - Outstanding bills
 */

import { apiRequest }        from '../services/api.js';
import { getOrgId }          from './auth.js';
import { fmtUGX }            from '../utils/format.js';

// ─── FETCH ─────────────────────────────────────────────────────────────────────
async function fetchDashboardData() {
  const orgId      = getOrgId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const iso = todayStart.toISOString();

  const [visits, pendingRx, bills] = await Promise.all([
    apiRequest(`/visits?org_id=eq.${orgId}&created_at=gte.${iso}&select=id,status`).catch(() => []),
    apiRequest(`/prescriptions?status=eq.pending&select=id,visit_id,visits!inner(org_id)&visits.org_id=eq.${orgId}`).catch(() => []),
    apiRequest(`/bills?select=total_amount,status,visits!inner(org_id)&visits.org_id=eq.${orgId}&created_at=gte.${iso}`).catch(() => []),
  ]);

  const totalVisits    = visits.length;
  const waitingCount   = visits.filter(v => v.status === 'waiting').length;
  const inConsultCount = visits.filter(v => v.status === 'in_consult').length;
  const completedCount = visits.filter(v => v.status === 'completed').length;

  const pendingRxCount = pendingRx.length;

  const todayRevenue    = (bills || [])
    .filter(b => b.status === 'paid')
    .reduce((s, b) => s + Number(b.total_amount), 0);
  const outstandingTotal = (bills || [])
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + Number(b.total_amount), 0);

  return {
    totalVisits,
    waitingCount,
    inConsultCount,
    completedCount,
    pendingRxCount,
    todayRevenue,
    outstandingTotal,
  };
}

// ─── RENDER ────────────────────────────────────────────────────────────────────
/**
 * renderStats — populates stat cards by data-stat attribute.
 * Each card element should have data-stat="totalVisits" etc.
 */
function renderStats(stats) {
  const setEl = (attr, value) => {
    const el = document.querySelector(`[data-stat="${attr}"]`);
    if (el) el.textContent = value;
  };

  setEl('totalVisits',    stats.totalVisits);
  setEl('waitingCount',   stats.waitingCount);
  setEl('inConsultCount', stats.inConsultCount);
  setEl('completedCount', stats.completedCount);
  setEl('pendingRxCount', stats.pendingRxCount);
  setEl('todayRevenue',   fmtUGX(stats.todayRevenue));
  setEl('outstanding',    fmtUGX(stats.outstandingTotal));
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export { fetchDashboardData, renderStats };