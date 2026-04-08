/**
 * dashboard.js — Minza Health Dashboard Module
 *
 * Responsibility: Fetch summary stats and render stat cards.
 *
 * PostgREST embedded filter syntax (critical to get right):
 *   To filter on a related table column use:
 *     ?select=*,table!inner(col)&table.col=eq.value
 *   The !inner makes it an inner join (rows without a match are excluded).
 *   Without !inner it's a LEFT join and the filter is silently ignored.
 */
 
import { apiRequest } from '../services/api.js';
import { getOrgId }   from './auth.js';
import { fmtUGX }     from '../utils/format.js';
 
// FETCH 
async function fetchDashboardData() {
  const orgId      = getOrgId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const iso = todayStart.toISOString();
 
  const [visits, pendingRx, bills] = await Promise.all([
 
    // Visits for this org today — direct filter on org_id, no join needed
    apiRequest(
      `/visits?org_id=eq.${orgId}&created_at=gte.${iso}&select=id,status`
    ).catch(() => []),
 
    // Pending prescriptions — must filter through visits using !inner join
    // Syntax: select the join column, then filter it as a query param
    apiRequest(
      `/prescriptions?status=eq.pending` +
      `&select=id,visit_id,visits!inner(id,org_id)` +
      `&visits.org_id=eq.${orgId}`
    ).catch(() => []),
 
    // Today's bills — filter through visits using !inner join
    apiRequest(
      `/bills?created_at=gte.${iso}` +
      `&select=total_amount,status,visits!inner(org_id)` +
      `&visits.org_id=eq.${orgId}`
    ).catch(() => []),
 
  ]);
 
  const totalVisits    = (visits || []).length;
  const waitingCount   = (visits || []).filter(v => v.status === 'waiting').length;
  const inConsultCount = (visits || []).filter(v => v.status === 'in_consult').length;
  const completedCount = (visits || []).filter(v => v.status === 'completed').length;
  const pendingRxCount = (pendingRx || []).length;
 
  const todayRevenue = (bills || [])
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
 
// RENDER 
/**
 * renderStats — writes values into stat card elements by data-stat attribute.
 * Safe to call with partial data — missing keys are silently skipped.
 */
function renderStats(stats) {
  const set = (attr, value) => {
    const el = document.querySelector(`[data-stat="${attr}"]`);
    if (el) el.textContent = value;
  };
 
  set('totalVisits',    stats.totalVisits    ?? 0);
  set('waitingCount',   stats.waitingCount   ?? 0);
  set('inConsultCount', stats.inConsultCount ?? 0);
  set('completedCount', stats.completedCount ?? 0);
  set('pendingRxCount', stats.pendingRxCount ?? 0);
  set('todayRevenue',   fmtUGX(stats.todayRevenue    ?? 0));
  set('outstanding',    fmtUGX(stats.outstandingTotal ?? 0));
}
 
// EXPORTS 
export { fetchDashboardData, renderStats };
 