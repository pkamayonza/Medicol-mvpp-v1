/**
 * pharmacy.js — Minza Health Pharmacy Module
 *
 * Responsibility (ONE): Everything to do with pharmacy_orders.
 *  - Fetch incoming orders (for pharmacy view)
 *  - Send prescription to internal or external pharmacy
 *  - Accept / reject / dispense an order
 *  - Fetch linked pharmacies for a clinic
 *  - Render pharmacy order list
 */

import { apiRequest }        from '../services/api.js';
import { getOrgId }          from './auth.js';
import { fmtDate, escapeHtml, fmtUGX } from '../utils/format.js';
import { showToast }         from '../utils/ui.js';

// ─── ORDER STATUS ──────────────────────────────────────────────────────────────
export const ORDER_STATUS = {
  SENT:      'sent',
  ACCEPTED:  'accepted',
  REJECTED:  'rejected',
  DISPENSED: 'dispensed',
};

export const ORDER_TYPE = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
};

// ─── FETCH ORDERS (Pharmacy view) ──────────────────────────────────────────────
/**
 * fetchIncomingOrders — fetches all pharmacy_orders sent to this pharmacy org.
 */
async function fetchIncomingOrders(statusFilter = null) {
  const orgId = getOrgId();
  let endpoint = `/pharmacy_orders?pharmacy_id=eq.${orgId}&order=created_at.desc&select=*,prescriptions(*,prescription_items(*),visits(*,patients(full_name,phone)))`;

  if (statusFilter) {
    endpoint += `&status=eq.${statusFilter}`;
  }

  const data = await apiRequest(endpoint);
  return data || [];
}

/**
 * fetchSentOrders — fetches orders sent FROM this clinic.
 */
async function fetchSentOrders() {
  const orgId = getOrgId();
  const data = await apiRequest(
    `/pharmacy_orders?clinic_id=eq.${orgId}&order=created_at.desc&select=*,prescriptions(*,prescription_items(*))`
  );
  return data || [];
}

// ─── FETCH LINKED PHARMACIES ───────────────────────────────────────────────────
/**
 * fetchLinkedPharmacies — returns pharmacies linked to this clinic.
 * Used to populate the pharmacy selection dropdown.
 */
async function fetchLinkedPharmacies() {
  const orgId = getOrgId();
  const data = await apiRequest(
    `/clinic_pharmacies?clinic_id=eq.${orgId}&select=*,organizations!pharmacy_id(id,name,type)`
  );
  return data || [];
}

// ─── SEND TO PHARMACY ──────────────────────────────────────────────────────────
/**
 * sendToPharmacy — creates a pharmacy_order record.
 * @param {string} prescriptionId
 * @param {string} pharmacyId         - target pharmacy org id
 * @param {'internal'|'external'} orderType
 */
async function sendToPharmacy(prescriptionId, pharmacyId, orderType) {
  if (!prescriptionId) throw new Error('Prescription ID is required.');
  if (!pharmacyId)     throw new Error('Select a pharmacy first.');
  if (!Object.values(ORDER_TYPE).includes(orderType)) {
    throw new Error('Invalid order type.');
  }

  const orgId = getOrgId();

  const result = await apiRequest('/pharmacy_orders', 'POST', {
    prescription_id: prescriptionId,
    clinic_id:       orgId,
    pharmacy_id:     pharmacyId,
    order_type:      orderType,
    status:          ORDER_STATUS.SENT,
  });

  if (result) {
    return Array.isArray(result) ? result[0] : result;
  }
  return null; // offline queued
}

// ─── UPDATE ORDER STATUS ───────────────────────────────────────────────────────
async function updateOrderStatus(orderId, status) {
  if (!Object.values(ORDER_STATUS).includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }

  const result = await apiRequest(
    `/pharmacy_orders?id=eq.${orderId}`,
    'PATCH',
    { status }
  );

  // If dispensed, also update the prescription status
  if (status === ORDER_STATUS.DISPENSED) {
    // Get the order to find prescription_id
    const orders = await apiRequest(`/pharmacy_orders?id=eq.${orderId}&select=prescription_id`);
    const prescriptionId = orders?.[0]?.prescription_id;
    if (prescriptionId) {
      await apiRequest(
        `/prescriptions?id=eq.${prescriptionId}`,
        'PATCH',
        { status: 'dispensed' }
      ).catch(() => {});
    }
  }

  return result;
}

// ─── RENDER ORDER LIST ─────────────────────────────────────────────────────────
/**
 * renderOrderList — renders pharmacy orders into a container.
 * @param {HTMLElement} container  - tbody
 * @param {Array} orders
 * @param {Object} handlers        - { onAccept, onReject, onDispense, onView }
 * @param {boolean} isPharmacyView - show accept/reject/dispense if true
 */
function renderOrderList(container, orders, handlers = {}, isPharmacyView = false) {
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No orders found.</td>
      </tr>`;
    return;
  }

  const statusBadge = s => {
    const map = {
      sent:      { cls: 'badge--info',    label: 'Sent' },
      accepted:  { cls: 'badge--warn',    label: 'Accepted' },
      rejected:  { cls: 'badge--danger',  label: 'Rejected' },
      dispensed: { cls: 'badge--success', label: 'Dispensed' },
    };
    const { cls, label } = map[s] || { cls: 'badge--neutral', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const typeBadge = t => `
    <span class="badge ${t === 'internal' ? 'badge--teal' : 'badge--neutral'}">
      ${t}
    </span>`;

  container.innerHTML = orders.map(order => {
    const presc   = order.prescriptions || {};
    const items   = presc.prescription_items || [];
    const visit   = presc.visits || {};
    const patient = visit.patients || {};
    const drugList = items.map(i => escapeHtml(i.drug_name)).join(', ') || '—';
    const total    = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);

    return `
      <tr>
        <td>
          <div class="patient-name">${escapeHtml(patient.full_name || '—')}</div>
          <div class="text-muted text-sm">${patient.phone || '—'}</div>
        </td>
        <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${drugList}
        </td>
        <td>${typeBadge(order.order_type)}</td>
        <td>${statusBadge(order.status)}</td>
        <td class="text-muted text-sm">${fmtDate(order.created_at)}</td>
        <td class="td-actions">
          <button class="btn btn-sm btn--outline js-view-order" data-order-id="${order.id}">
            View
          </button>
          ${isPharmacyView && order.status === ORDER_STATUS.SENT ? `
            <button class="btn btn-sm btn--primary js-accept" data-order-id="${order.id}">Accept</button>
            <button class="btn btn-sm btn--danger js-reject" data-order-id="${order.id}">Reject</button>
          ` : ''}
          ${isPharmacyView && order.status === ORDER_STATUS.ACCEPTED ? `
            <button class="btn btn-sm btn--success js-dispense" data-order-id="${order.id}">Dispense</button>
          ` : ''}
        </td>
      </tr>`;
  }).join('');

  // Bind buttons
  const bind = (cls, handler) => {
    container.querySelectorAll(cls).forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const { orderId } = btn.dataset;
        btn.disabled = true;
        try {
          if (handler) await handler(btn.dataset.orderId, btn);
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  };

  bind('.js-view-order', handlers.onView);
  bind('.js-accept',     async id => {
    await updateOrderStatus(id, ORDER_STATUS.ACCEPTED);
    if (handlers.onAccept) handlers.onAccept(id);
  });
  bind('.js-reject',     async id => {
    await updateOrderStatus(id, ORDER_STATUS.REJECTED);
    if (handlers.onReject) handlers.onReject(id);
  });
  bind('.js-dispense',   async id => {
    await updateOrderStatus(id, ORDER_STATUS.DISPENSED);
    if (handlers.onDispense) handlers.onDispense(id);
  });
}

// ─── RENDER PHARMACY SELECTOR ──────────────────────────────────────────────────
/**
 * renderPharmacySelector — populates a <select> with linked pharmacies.
 * Always prepends an "Internal Pharmacy" option.
 *
 * @param {HTMLSelectElement} select
 * @param {Array} linkedPharmacies   - from fetchLinkedPharmacies()
 * @param {string} internalPharmacyId - org id of this clinic's internal pharmacy
 */
function renderPharmacySelector(select, linkedPharmacies, internalPharmacyId) {
  if (!select) return;

  const options = [];

  if (internalPharmacyId) {
    options.push(`
      <option value="${internalPharmacyId}" data-type="internal">
        Internal Pharmacy
      </option>`);
  }

  linkedPharmacies.forEach(link => {
    const org = link.organizations;
    if (!org || org.id === internalPharmacyId) return;
    options.push(`
      <option value="${org.id}" data-type="external">
        ${escapeHtml(org.name)} (Partner)
      </option>`);
  });

  if (!options.length) {
    options.push(`<option value="" disabled>No pharmacies configured</option>`);
  }

  select.innerHTML = `<option value="">— Select Pharmacy —</option>` + options.join('');
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
export {
  fetchIncomingOrders,
  fetchSentOrders,
  fetchLinkedPharmacies,
  sendToPharmacy,
  updateOrderStatus,
  renderOrderList,
  renderPharmacySelector,
  ORDER_STATUS,
  ORDER_TYPE,
};