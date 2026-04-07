import { apiRequest }          from '../services/api.js';
import { fmtUGX, escapeHtml } from '../utils/format.js';
import { showToast }           from '../utils/ui.js';
 
// IN-MEMORY ITEM STORE 
// Factory — each page creates its own store instance.
function createItemsStore() {
  let _items = [];
 
  function add({ drug_name, dosage, quantity, price }) {
    if (!drug_name?.trim()) throw new Error('Drug name is required.');
    _items.push({
      _key:      crypto.randomUUID(),
      drug_name: drug_name.trim(),
      dosage:    dosage?.trim() || null,
      quantity:  parseInt(quantity) || 1,
      price:     parseFloat(price)  || 0,
    });
    return [..._items];
  }
 
  function remove(key)  { _items = _items.filter(i => i._key !== key); return [..._items]; }
  function getAll()     { return [..._items]; }
  function clear()      { _items = []; }
  function getTotal()   { return _items.reduce((s, i) => s + i.price * i.quantity, 0); }
 
  return { add, remove, getAll, clear, getTotal };
}
 
// FETCH
async function fetchPrescriptionByVisit(visitId) {
  const data = await apiRequest(
    `/prescriptions?visit_id=eq.${visitId}` +
    `&select=*,prescription_items(*)&order=created_at.desc&limit=1`
  );
  return data?.[0] || null;
}
 
async function fetchPrescriptionById(prescriptionId) {
  const data = await apiRequest(
    `/prescriptions?id=eq.${prescriptionId}&select=*,prescription_items(*)`
  );
  return data?.[0] || null;
}
 
// CREATE 
async function createPrescription(visitId, items) {
  if (!visitId)       throw new Error('Visit ID is required.');
  if (!items?.length) throw new Error('Add at least one drug to the prescription.');
 
  // 1. Prescription header
  const prescResult = await apiRequest('/prescriptions', 'POST', {
    visit_id: visitId,
    status:   'pending',
  });
 
  if (!prescResult) {
    showToast('Prescription queued offline. Items will sync when back online.', 'warn');
    return null;
  }
 
  const prescription = Array.isArray(prescResult) ? prescResult[0] : prescResult;
 
  // 2. Bulk insert items
  const itemPayloads = items.map(item => ({
    prescription_id: prescription.id,
    drug_name:       item.drug_name,
    dosage:          item.dosage   || null,
    quantity:        item.quantity,
    price:           item.price    || null,
  }));
 
  await apiRequest('/prescription_items', 'POST', itemPayloads);
 
  return prescription;
}
 
// RENDER BUILDER
/**
 * renderItems — renders the drug list in the prescription builder.
 *
 * @param {HTMLElement}    container
 * @param {Array}          items      from itemsStore.getAll()
 * @param {Function}       onRemove   called with item._key
 * @param {HTMLElement|null} totalEl  element to update with total; falls back to #rx-total
 */
function renderItems(container, items, onRemove, totalEl = null) {
  if (!container) return;
 
  // Resolve totalEl — accept passed element or fall back to ID lookup
  const _totalEl = totalEl || document.getElementById('rx-total');
 
  if (!items.length) {
    container.innerHTML = `<div class="empty-state empty-state--sm">No drugs added yet.</div>`;
    if (_totalEl) _totalEl.textContent = fmtUGX(0);
    return;
  }
 
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
 
  container.innerHTML = items.map(item => `
    <div class="rx-item" data-key="${item._key}">
      <div class="rx-item__info">
        <div class="rx-item__name">${escapeHtml(item.drug_name)}</div>
        <div class="rx-item__meta">
          ${item.dosage ? escapeHtml(item.dosage) + ' · ' : ''}Qty: ${item.quantity}${item.price ? ' · ' + fmtUGX(item.price * item.quantity) : ''}
        </div>
      </div>
      <button class="btn btn--sm btn--danger js-remove-drug"
              data-key="${item._key}"
              aria-label="Remove ${escapeHtml(item.drug_name)}">✕</button>
    </div>`).join('');
 
  if (_totalEl) _totalEl.textContent = fmtUGX(total);
 
  container.querySelectorAll('.js-remove-drug').forEach(btn => {
    btn.addEventListener('click', () => { if (onRemove) onRemove(btn.dataset.key); });
  });
}
 
// RENDER READ-ONLY CARD
function renderPrescriptionCard(container, prescription) {
  if (!container) return;
 
  if (!prescription) {
    container.innerHTML = `<div class="empty-state">No prescription for this visit.</div>`;
    return;
  }
 
  const items = prescription.prescription_items || [];
  const total = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
 
  container.innerHTML = `
    <div class="rx-card">
      <div class="rx-card__header">
        <span class="badge ${prescription.status === 'dispensed' ? 'badge--success' : 'badge--warn'}">
          ${prescription.status}
        </span>
        <span class="text-muted text-sm">Rx #${prescription.id.slice(-6).toUpperCase()}</span>
      </div>
      <div class="rx-card__items">
        ${items.map(i => `
          <div class="rx-item">
            <div class="rx-item__info">
              <div class="rx-item__name">${escapeHtml(i.drug_name)}</div>
              <div class="rx-item__meta">
                ${i.dosage ? escapeHtml(i.dosage) + ' · ' : ''}Qty: ${i.quantity || 1}
                ${i.price ? ' · ' + fmtUGX(i.price * (i.quantity || 1)) : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>
      ${total > 0 ? `<div class="rx-card__total">Total: <strong>${fmtUGX(total)}</strong></div>` : ''}
    </div>`;
}
 
// EXPORTS
export {
  createItemsStore,
  fetchPrescriptionByVisit,
  fetchPrescriptionById,
  createPrescription,
  renderItems,
  renderPrescriptionCard,
};
 