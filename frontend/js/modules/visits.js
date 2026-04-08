/**
 * visits.js — Minza Health Visits Module
 *
 * Responsibility: Everything to do with the visits table.
 */

import { apiRequest } from '../services/api.js';
import { getOrgId }   from './auth.js';
import { fmtTime, escapeHtml } from '../utils/format.js';
import { showToast }  from '../utils/ui.js';

export const VISIT_STATUS = {
  WAITING:    'waiting',
  IN_CONSULT: 'in_consult',
  COMPLETED:  'completed',
};

// FETCH 
async function fetchTodaysVisits() {
  const orgId      = getOrgId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const iso = todayStart.toISOString();

  const data = await apiRequest(
    `/visits?org_id=eq.${orgId}` +
    `&created_at=gte.${iso}` +
    `&order=created_at.asc` +
    `&select=*,patients(full_name,phone,gender,dob)`
  );
  return data || [];
}

async function fetchVisitById(visitId) {
  const data = await apiRequest(
    `/visits?id=eq.${visitId}` +
    `&select=*,patients(full_name,phone,gender,dob),consultations(*),prescriptions(*)`
  );
  return data?.[0] || null;
}

// CREATE 
async function createVisit(patientId) {
  if (!patientId) throw new Error('Patient ID required to start a visit.');
  const orgId = getOrgId();
  const result = await apiRequest('/visits', 'POST', {
    org_id:     orgId,
    patient_id: patientId,
    status:     VISIT_STATUS.WAITING,
  });
  if (result) return Array.isArray(result) ? result[0] : result;
  return null; // offline — queued
}

// UPDATE STATUS 
async function updateVisitStatus(visitId, status) {
  if (!Object.values(VISIT_STATUS).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  return apiRequest(`/visits?id=eq.${visitId}`, 'PATCH', { status });
}

// RENDER QUEUE 
/**
 * @param {HTMLElement} container  — tbody element
 * @param {Array}       visits
 * @param {Object}      handlers   — { onConsult(visitId), onView(visitId) }
 */
function renderQueue(container, visits, handlers = {}) {
  if (!container) return;

  if (!visits.length) {
    container.innerHTML =
      `<tr><td colspan="5" class="empty-state">No patients in queue today.</td></tr>`;
    return;
  }

  const statusBadge = s => {
    const map = {
      waiting:    { cls: 'badge--warn',    label: 'Waiting'    },
      in_consult: { cls: 'badge--info',    label: 'In Consult' },
      completed:  { cls: 'badge--success', label: 'Completed'  },
    };
    const { cls, label } = map[s] || { cls: 'badge--neutral', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };

  container.innerHTML = visits.map((v, i) => {
    const patient = v.patients || {};
    return `
      <tr>
        <td class="text-muted text-sm">${i + 1}</td>
        <td>
          <div class="patient-name">${escapeHtml(patient.full_name || '—')}</div>
          <div class="text-muted text-sm">${patient.phone || '—'}</div>
        </td>
        <td class="text-sm">${fmtTime(v.created_at)}</td>
        <td>${statusBadge(v.status)}</td>
        <td class="td-actions">
          ${v.status === VISIT_STATUS.WAITING ? `
            <button class="btn btn--sm btn--primary js-consult"
                    data-visit-id="${v.id}"
                    data-patient-id="${v.patient_id}">
              Consult
            </button>` : ''}
          <button class="btn btn--sm btn--outline js-view-visit"
                  data-visit-id="${v.id}">
            View
          </button>
        </td>
      </tr>`;
  }).join('');

  // Consult — disable while update is in flight, re-enable on error
  container.querySelectorAll('.js-consult').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled    = true;
      btn.textContent = 'Opening…';
      try {
        await updateVisitStatus(btn.dataset.visitId, VISIT_STATUS.IN_CONSULT);
        if (handlers.onConsult) handlers.onConsult(btn.dataset.visitId, btn.dataset.patientId);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Consult';
      }
    });
  });

  // View
  container.querySelectorAll('.js-view-visit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (handlers.onView) handlers.onView(btn.dataset.visitId);
    });
  });
}

// EXPORTS 
export {
  fetchTodaysVisits,
  fetchVisitById,
  createVisit,
  updateVisitStatus,
  renderQueue,
  VISIT_STATUS,
};