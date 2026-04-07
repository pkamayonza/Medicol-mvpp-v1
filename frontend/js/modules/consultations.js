import { apiRequest }                    from '../services/api.js';
import { updateVisitStatus, VISIT_STATUS } from './visits.js';
import { showToast }                      from '../utils/ui.js';
import { escapeHtml }                     from '../utils/format.js';

// FETCH
async function fetchConsultationByVisit(visitId) {
  const data = await apiRequest(
    `/consultations?visit_id=eq.${visitId}&order=created_at.desc&limit=1`
  );
  return data?.[0] || null;
}

// CREATE
/**
 * createConsultation saves a consultation record.
 * Also marks the visit as completed.
 *
 * @param {string} visitId
 * @param {{ symptoms, diagnosis, notes }} payload
 * @returns {Promise<object|null>}
 */
async function createConsultation(visitId, { symptoms, diagnosis, notes }) {
  if (!visitId)   throw new Error('Visit ID is required.');
  if (!diagnosis?.trim()) throw new Error('Diagnosis is required.');

  const result = await apiRequest('/consultations', 'POST', {
    visit_id:  visitId,
    symptoms:  symptoms?.trim()  || null,
    diagnosis: diagnosis.trim(),
    notes:     notes?.trim()     || null,
  });

  // Mark visit as completed
  await updateVisitStatus(visitId, VISIT_STATUS.COMPLETED).catch(() => {});

  if (result) {
    return Array.isArray(result) ? result[0] : result;
  }
  return null;
}

// RENDER
/**
 * renderConsultationCard displays a consultation record in a container element.
 */
function renderConsultationCard(container, consult) {
  if (!container) return;

  if (!consult) {
    container.innerHTML = `
      <div class="empty-state">No consultation recorded yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Symptoms</div>
        <div class="detail-value">${escapeHtml(consult.symptoms || '—')}</div>
      </div>
      <div class="detail-item detail-item--full">
        <div class="detail-label">Diagnosis</div>
        <div class="detail-value detail-value--highlight">${escapeHtml(consult.diagnosis || '—')}</div>
      </div>
      <div class="detail-item detail-item--full">
        <div class="detail-label">Clinical Notes</div>
        <div class="detail-value">${escapeHtml(consult.notes || '—')}</div>
      </div>
    </div>`;
}

// FORM BINDING
/**
 * bindConsultationForm attaches submit logic to the consultation form.
 * @param {HTMLFormElement} form
 * @param {string} visitId
 * @param {Function} onSuccess - called with created consultation
 */
function bindConsultationForm(form, visitId, onSuccess) {
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = form.querySelector('[type="submit"]');
    const errEl = form.querySelector('.form-error');

    const payload = {
      symptoms:  form.querySelector('[name="symptoms"]')?.value,
      diagnosis: form.querySelector('[name="diagnosis"]')?.value,
      notes:     form.querySelector('[name="notes"]')?.value,
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (errEl) errEl.textContent = '';

    try {
      const consult = await createConsultation(visitId, payload);
      showToast(consult ? 'Consultation saved.' : 'Saved offline — will sync when online.');
      if (onSuccess) onSuccess(consult);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      else showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Consultation'; }
    }
  });
}

// EXPORTS
export {
  fetchConsultationByVisit,
  createConsultation,
  renderConsultationCard,
  bindConsultationForm,
};