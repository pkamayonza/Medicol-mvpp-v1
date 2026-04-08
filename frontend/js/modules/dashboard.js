import { apiRequest } from '../services/api.js';
import { getOrgId }   from './auth.js';
import { fmtUGX }     from '../utils/format.js';
import { API_BASE_URL } from './config.js';
 
// FETCH
async function fetchDashboardData() {
  const orgId      = getOrgId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const iso = todayStart.toISOString();
 
  /**
   * NOTE on PostgREST embedded filter syntax:
   * To filter on a related table column, use the format:
   *   ?select=*,related_table!inner(col)&related_table.col=eq.value
   *
   * The `!inner` makes it an inner join (excludes rows with no match).
   * Without `!inner` it's a left join and the filter is ignored.
   */
  const [visits, pendingRx, bills] = await Promise.all([
    // Visits for today for this org — direct filter, no join needed
    apiRequest(
      `/visits?org_id=eq.${orgId}&created_at=gte.${iso}&select=id,status`
    ).catch(() => []),
 
    // Pending prescriptions for this org — filter through visits inner join
    apiRequest(
      `/prescriptions?status=eq.pending` +
      `&select=id,visit_id,visits!inner(id,org_id)` +
      `&visits.org_id=eq.${orgId}`
    ).catch(() => []),
 
    // Today's bills for this org — filter through visits inner join
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
 * renderStats — populates stat card elements by data-stat attribute.
 */
function renderStats(stats) {
  const set = (attr, value) => {
    const el = document.querySelector(`[data-stat="${attr}"]`);
    if (el) el.textContent = value;
  };
 
  set('totalVisits',    stats.totalVisits);
  set('waitingCount',   stats.waitingCount);
  set('inConsultCount', stats.inConsultCount);
  set('completedCount', stats.completedCount);
  set('pendingRxCount', stats.pendingRxCount);
  set('todayRevenue',   fmtUGX(stats.todayRevenue));
  set('outstanding',    fmtUGX(stats.outstandingTotal));
}
 
// EXPORTS
export { fetchDashboardData, renderStats };
 