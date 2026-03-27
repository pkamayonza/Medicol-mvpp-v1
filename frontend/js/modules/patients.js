/**
 * patients.js — Minza Health Patients Module
 *
 * Responsibility (ONE): Everything to do with the patients table.
 *  - Fetch patients for current org
 *  - Create patient
 *  - Search patients (name + phone)
 *  - Render patient list to a given container
 *  - Bind form submission
 */

import { apiRequest } from '../services/api.js';
import { getOrgId }   from './auth.js';
import { fmtDate, fmtAge, escapeHtml } from '../utils/format.js';
import { showToast }  from '../utils/ui.js';

// ─── DATA ──────────────────────────────────────────────────────────────────────
let _patients = [];

function getCached() { return _patients; }

// ─── FETCH ─────────────────────────────────────────────────────────────────────
async function fetchPatients(searchTerm = '') {
  const orgId = getOrgId();
  let endpoint = `/patients?org_id=eq.${orgId}&order=created_at.desc`;

  if (searchTerm.trim()) {
    const q = encodeURIComponent(searchTerm.trim());
    // PostgREST OR filter: name ilike OR phone ilike
    endpoint = `/patients?org_id=eq.${orgId}&or=(full_name.ilike.*${q}*,phone.ilike.*${q}*)&order=created_at.desc`;
  }

  const data = await apiRequest(endpoint);
  _patients = data || [];
  return _patients;
}

// ─── CREATE ────────────────────────────────────────────────────────────────────
async function createPatient({ full_name, phone, gender, dob }) {
  if (!full_name?.trim()) throw new Error('Patient name is required.');

  const orgId = getOrgId();
  const result = await apiRequest('/patients', 'POST', {
    org_id:    orgId,
    full_name: full_name.trim(),
    phone:     phone?.trim()  || null,
    gender:    gender         || null,
    dob:       dob            || null,
  });

  if (result) {
    const created = Array.isArray(result) ? result[0] : result;
    _patients.unshift(created);
    return created;
  }
  return null; // queued offline
}

// ─── SEARCH ────────────────────────────────────────────────────────────────────
async function searchPatients(term) {
  return fetchPatients(term);
}

// ─── RENDER ────────────────────────────────────────────────────────────────────
/**
 * renderPatientList — injects patient rows into a <tbody> or container element.
 * @param {HTMLElement} container
 * @param {Array} patients
 * @param {Function} onSelect - called with patient object when row is clicked
 */
function renderPatientList(container, patients, onSelect) {
  if (!container) return;

  if (!patients.length) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No patients found.</td>
      </tr>`;
    return;
  }

  container.innerHTML = patients.map(p => `
    <tr class="table-row--clickable" data-id="${p.id}">
      <td>
        <div class="patient-name">${escapeHtml(p.full_name)}</div>
        <div class="text-muted text-sm">${p.phone || '—'}</div>
      </td>
      <td style="text-transform:capitalize;">${p.gender || '—'}</td>
      <td>${fmtAge(p.dob)}</td>
      <td class="text-muted text-sm">${fmtDate(p.created_at)}</td>
      <td class="td-actions">
        <button class="btn btn--sm btn--outline js-view-profile" data-patient-id="${p.id}">
          Profile
        </button>
        <button class="btn btn--sm btn--primary js-start-visit" data-patient-id="${p.id}">
          Visit
        </button>
      </td>
    </tr>
  `).join('');

  // Profile → patient-profile.html
  container.querySelectorAll('.js-view-profile').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.location.href = `patient-profile.html?id=${btn.dataset.patientId}`;
    });
  });

  // Visit → call onSelect (opens start-visit modal)
  container.querySelectorAll('.js-start-visit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const patient = _patients.find(p => p.id === btn.dataset.patientId);
      if (patient && onSelect) onSelect(patient);
    });
  });

  // Row click → profile
  container.querySelectorAll('.table-row--clickable').forEach(row => {
    row.addEventListener('click', () => {
      window.location.href = `patient-profile.html?id=${row.dataset.id}`;
    });
  });
}

// ─── FORM BINDING ──────────────────────────────────────────────────────────────
/**
 * bindCreateForm — attaches submit handler to the new patient form.
 * @param {HTMLFormElement} form
 * @param {Function} onSuccess - called with created patient
 */
function bindCreateForm(form, onSuccess) {
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const errEl = form.querySelector('.form-error');

    const payload = {
      full_name: form.querySelector('[name="full_name"]')?.value,
      phone:     form.querySelector('[name="phone"]')?.value,
      gender:    form.querySelector('[name="gender"]')?.value,
      dob:       form.querySelector('[name="dob"]')?.value,
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (errEl) errEl.textContent = '';

    try {
      const patient = await createPatient(payload);
      form.reset();
      showToast(patient ? 'Patient registered.' : 'Saved offline — will sync when back online.');
      if (onSuccess) onSuccess(patient);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      else showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Register Patient'; }
    }
  });
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export {
  fetchPatients,
  createPatient,
  searchPatients,
  renderPatientList,
  bindCreateForm,
  getCached,
};