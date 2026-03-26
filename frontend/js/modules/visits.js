/**
 * visits.js — Minza Health Visits Module
 *
 * Responsibility (ONE): Everything to do with the visits table.
 *  - Create a visit for a patient
 *  - Update visit status (waiting → in_consult → completed)
 *  - Fetch visits for today's queue
 *  - Render the queue
 */

import { apiRequest }  from '../services/api.js';
import { getOrgId }    from './auth.js';
import { fmtTime, fmtDate, escapeHtml } from '../utils/format.js';
import { showToast }   from '../utils/ui.js';

// Valid statuses — mirrors the visit_status enum in the DB
export const VISIT_STATUS = {
  WAITING:    'waiting',
  IN_CONSULT: 'in_consult',
  COMPLETED:  'completed',
};

// ─── FETCH ─────────────────────────────────────────────────────────────────────
/**
 * fetchTodaysVisits — returns all visits created today for this org,
 * joined with patient data.
 */
async function fetchTodaysVisits() {
  const orgId = getOrgId();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const iso = todayStart.toISOString();

  // PostgREST: select visits + embedded patient name
  const data = await apiRequest(
    `/visits?org_id=eq.${orgId}&created_at=gte.${iso}&order=created_at.asc&select=*,patients(full_name,phone,gender,dob)`
  );
  return data || [];
}

/**
 * fetchVisitById — full visit record with patient and consultation.
 */
async function fetchVisitById(visitId) {
  const data = await apiRequest(
    `/visits?id=eq.${visitId}&select=*,patients(full_name,phone,gender,dob),consultations(*),prescriptions(*)`
  );
  return data?.[0] || null;
}

// ─── CREATE ────────────────────────────────────────────────────────────────────
async function createVisit(patientId) {
  if (!patientId) throw new Error('Patient ID required to start a visit.');
  const orgId = getOrgId();

  const result = await apiRequest('/visits', 'POST', {
    org_id:     orgId,
    patient_id: patientId,
    status:     VISIT_STATUS.WAITING,
  });

  if (result) {
    return Array.isArray(result) ? result[0] : result;
  }
  return null; // offline queued
}

// ─── UPDATE STATUS ─────────────────────────────────────────────────────────────
async function updateVisitStatus(visitId, status) {
  if (!Object.values(VISIT_STATUS).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const result = await apiRequest(
    `/visits?id=eq.${visitId}`,
    'PATCH',
    { status }
  );
  return result;
}

// ─── RENDER QUEUE ──────────────────────────────────────────────────────────────
/**
 * renderQueue — renders today's visit queue into a container.
 * @param {HTMLElement} container  - tbody or div
 * @param {Array} visits
 * @param {Object} handlers        - { onConsult, onView }
 */
function renderQueue(container, visits, handlers = {}) {
  if (!container) return;

  if (!visits.length) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No patients in queue today.</td>
      </tr>`;
    return;
  }

  const statusBadge = s => {
    const map = {
      waiting:    { cls: 'badge--warn',    label: 'Waiting' },
      in_consult: { cls: 'badge--info',    label: 'In Consult' },
      completed:  { cls: 'badge--success', label: 'Completed' },
    };
    const { cls, label } = map[s] || { cls: 'badge--neutral', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };

  container.innerHTML = visits.map((v, i) => {
    const patient = v.patients || {};
    const name    = escapeHtml(patient.full_name || '—');
    const phone   = patient.phone || '—';
    const time    = fmtTime(v.created_at);

    return `
      <tr>
        <td class="text-muted text-sm">${i + 1}</td>
        <td>
          <div class="patient-name">${name}</div>
          <div class="text-muted text-sm">${phone}</div>
        </td>
        <td class="text-sm">${time}</td>
        <td>${statusBadge(v.status)}</td>
        <td class="td-actions">
          ${v.status === VISIT_STATUS.WAITING ? `
            <button class="btn btn-sm btn--primary js-consult" data-visit-id="${v.id}" data-patient-id="${v.patient_id}">
              Consult
            </button>
          ` : ''}
          <button class="btn btn-sm btn--outline js-view-visit" data-visit-id="${v.id}">
            View
          </button>
        </td>
      </tr>`;
  }).join('');

  // Bind consult button
  container.querySelectorAll('.js-consult').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { visitId, patientId } = btn.dataset;
      try {
        await updateVisitStatus(btn.dataset.visitId, VISIT_STATUS.IN_CONSULT);
        if (handlers.onConsult) handlers.onConsult(btn.dataset.visitId, btn.dataset.patientId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Bind view button
  container.querySelectorAll('.js-view-visit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (handlers.onView) handlers.onView(btn.dataset.visitId);
    });
  });
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export {
  fetchTodaysVisits,
  fetchVisitById,
  createVisit,
  updateVisitStatus,
  renderQueue,
  VISIT_STATUS,
};