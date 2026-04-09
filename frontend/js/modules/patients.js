import { apiRequest }                    from '../services/api.js';
import { getOrgId }                       from './auth.js';
import { fmtDate, fmtAge, escapeHtml }   from '../utils/format.js';
import { showToast }                      from '../utils/ui.js';
 
// STATE
let _patients = [];
function getCached() { return _patients; }
 
// FETCH
async function fetchPatients(searchTerm = '') {
  const orgId = getOrgId();
  let endpoint = `/patients?org_id=eq.${orgId}&order=created_at.desc`;
 
  if (searchTerm.trim()) {
    const q = encodeURIComponent(searchTerm.trim());
    endpoint =
      `/patients?org_id=eq.${orgId}` +
      `&or=(full_name.ilike.*${q}*,phone.ilike.*${q}*)` +
      `&order=created_at.desc`;
  }
 
  const data = await apiRequest(endpoint);
  _patients = data || [];
  return _patients;
}
 
// CREATE
async function createPatient({ full_name, phone, gender, dob }) {
  if (!full_name?.trim()) throw new Error('Patient name is required.');
 
  const result = await apiRequest('/patients', 'POST', {
    org_id:    getOrgId(),
    full_name: full_name.trim(),
    phone:     phone?.trim() || null,
    gender:    gender        || null,
    dob:       dob           || null,
  });
 
  if (result) {
    const created = Array.isArray(result) ? result[0] : result;
    _patients.unshift(created);
    return created;
  }
  return null; // offline queued
}
 
// SEARCH
async function searchPatients(term) {
  return fetchPatients(term);
}
 
// RENDER
/**
 * @param {HTMLElement} container  - tbody
 * @param {Array}       patients
 * @param {Function}    onSelect   - called with patient when Visit button is clicked
 */
function renderPatientList(container, patients, onSelect) {
  if (!container) return;
 
  if (!patients.length) {
    container.innerHTML = `<tr><td colspan="5" class="empty-state">No patients found.</td></tr>`;
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
    </tr>`).join('');
 
  // Profile → patient-profile.html
  container.querySelectorAll('.js-view-profile').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.location.href = `patient-profile.html?id=${btn.dataset.patientId}`;
    });
  });
 
  // Visit → open start-visit modal
  container.querySelectorAll('.js-start-visit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const patient = _patients.find(p => p.id == btn.dataset.patientId);
      if (!patient) {
        console.error('Patient not found for ID:', btn.dataset.patientId);
      return;
    }

      if (onSelect) onSelect(patient);
    });
    });
 
  // Row click → profile page
  container.querySelectorAll('.table-row--clickable').forEach(row => {
    row.addEventListener('click', () => {
      window.location.href = `patient-profile.html?id=${row.dataset.id}`;
    });
  });
}
 
// BIND CREATE FORM 
/**
 * @param {HTMLFormElement} form
 * @param {Function}        onSuccess  called with patient (or null if offline)
 */
function bindCreateForm(form, onSuccess) {
  if (!form) return;
 
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = form.querySelector('[type="submit"]');
    const errEl = form.querySelector('.form-error');
 
    const payload = {
      full_name: form.querySelector('[name="full_name"]')?.value?.trim(),
      phone:     form.querySelector('[name="phone"]')?.value?.trim() || null,
      gender:    form.querySelector('[name="gender"]')?.value || null,
      dob:       form.querySelector('[name="dob"]')?.value   || null,
    };
 
    // Client-side validation before hitting the network
    if (!payload.full_name) {
      if (errEl) { errEl.textContent = 'Patient name is required.'; errEl.style.display = 'block'; }
      return;
    }
 
    if (btn)  { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
 
    try {
      const patient = await createPatient(payload);
      form.reset();
      if (patient) {
        showToast('Patient registered.');
        if (onSuccess) onSuccess(patient);
      } else {
        // Offline — don't open visit modal with null patient
        showToast('Saved offline — will sync when back online.', 'warn');
        if (onSuccess) onSuccess(null);
      }
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      else showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Register Patient'; }
    }
  });
}
 
// EXPORTS
export {
  fetchPatients,
  createPatient,
  searchPatients,
  renderPatientList,
  bindCreateForm,
  getCached,
};
