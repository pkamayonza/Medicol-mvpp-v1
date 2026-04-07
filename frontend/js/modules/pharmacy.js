import { apiRequest }                    from '../services/api.js';
import { getOrgId }                       from './auth.js';
import { fmtDate, escapeHtml, fmtUGX }   from '../utils/format.js';
import { showToast }                      from '../utils/ui.js';
 
// CONSTANTS
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
 
// FETCH INCOMING (pharmacy view)
async function fetchIncomingOrders(statusFilter = null) {
  const orgId = getOrgId();
  let endpoint =
    `/pharmacy_orders?pharmacy_id=eq.${orgId}&order=created_at.desc` +
    `&select=*,prescriptions(*,prescription_items(*),visits(*,patients(full_name,phone)))`;
 
  if (statusFilter) endpoint += `&status=eq.${statusFilter}`;
 
  const data = await apiRequest(endpoint);
  return data || [];
}
 
// FETCH SENT (clinic view)
async function fetchSentOrders(statusFilter = null) {
  const orgId = getOrgId();
  let endpoint =
    `/pharmacy_orders?clinic_id=eq.${orgId}&order=created_at.desc` +
    `&select=*,prescriptions(*,prescription_items(*),visits(*,patients(full_name,phone)))`;
 
  if (statusFilter) endpoint += `&status=eq.${statusFilter}`;
 
  const data = await apiRequest(endpoint);
  return data || [];
}
 
// FETCH LINKED PHARMACIES
async function fetchLinkedPharmacies() {
  const orgId = getOrgId();
  const data  = await apiRequest(
    `/clinic_pharmacies?clinic_id=eq.${orgId}&select=*,organizations!pharmacy_id(id,name,type)`
  );
  return data || [];
}
 
// SEND TO PHARMACY
async function sendToPharmacy(prescriptionId, pharmacyId, orderType) {
  if (!prescriptionId) throw new Error('Prescription ID is required.');
  if (!pharmacyId)     throw new Error('Select a pharmacy first.');
  if (!Object.values(ORDER_TYPE).includes(orderType)) {
    throw new Error('Invalid order type.');
  }
 
  const result = await apiRequest('/pharmacy_orders', 'POST', {
    prescription_id: prescriptionId,
    clinic_id:       getOrgId(),
    pharmacy_id:     pharmacyId,
    order_type:      orderType,
    status:          ORDER_STATUS.SENT,
  });
 
  if (result) return Array.isArray(result) ? result[0] : result;
  return null;
}
 
// UPDATE ORDER STATUS
async function updateOrderStatus(orderId, status) {
  if (!Object.values(ORDER_STATUS).includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }
 
  const result = await apiRequest(
    `/pharmacy_orders?id=eq.${orderId}`,
    'PATCH',
    { status }
  );
 
  // When dispensed, mark the prescription as well
  if (status === ORDER_STATUS.DISPENSED) {
    const orders = await apiRequest(
      `/pharmacy_orders?id=eq.${orderId}&select=prescription_id`
    );
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
 
// RENDER ORDER LIST
/**
 * @param {HTMLElement} container     - tbody
 * @param {Array}       orders
 * @param {Object}      handlers      - { onView, onAccept, onReject, onDispense }
 * @param {boolean}     isPharmacyView
 */
function renderOrderList(container, orders, handlers = {}, isPharmacyView = false) {
  if (!container) return;
 
  if (!orders.length) {
    container.innerHTML = `<tr><td colspan="6" class="empty-state">No orders found.</td></tr>`;
    return;
  }
 
  const statusBadge = s => {
    const map = {
      sent:      { cls: 'badge--info',    label: 'Sent'      },
      accepted:  { cls: 'badge--warn',    label: 'Accepted'  },
      rejected:  { cls: 'badge--danger',  label: 'Rejected'  },
      dispensed: { cls: 'badge--success', label: 'Dispensed' },
    };
    const { cls, label } = map[s] || { cls: 'badge--neutral', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };
 
  const typeBadge = t =>
    `<span class="badge ${t === 'internal' ? 'badge--teal' : 'badge--neutral'}">${t}</span>`;
 
  container.innerHTML = orders.map(order => {
    const presc   = order.prescriptions || {};
    const items   = presc.prescription_items || [];
    const visit   = presc.visits || {};
    const patient = visit.patients || {};
    const drugs   = items.map(i => escapeHtml(i.drug_name)).join(', ') || '—';
 
    return `
      <tr>
        <td>
          <div class="patient-name">${escapeHtml(patient.full_name || '—')}</div>
          <div class="text-muted text-sm">${patient.phone || '—'}</div>
        </td>
        <td class="text-sm"
            style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            title="${drugs}">${drugs}</td>
        <td>${typeBadge(order.order_type)}</td>
        <td>${statusBadge(order.status)}</td>
        <td class="text-muted text-sm">${fmtDate(order.created_at)}</td>
        <td class="td-actions">
          <button class="btn btn--sm btn--outline js-view-order"
                  data-order-id="${order.id}">View</button>
          ${isPharmacyView && order.status === ORDER_STATUS.SENT ? `
            <button class="btn btn--sm btn--primary js-accept"
                    data-order-id="${order.id}">Accept</button>
            <button class="btn btn--sm btn--danger  js-reject"
                    data-order-id="${order.id}">Reject</button>
          ` : ''}
          ${isPharmacyView && order.status === ORDER_STATUS.ACCEPTED ? `
            <button class="btn btn--sm btn--success js-dispense"
                    data-order-id="${order.id}">Dispense</button>
          ` : ''}
        </td>
      </tr>`;
  }).join('');
 
  // Generic button binder
  const bind = (selector, handler) => {
    container.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          await handler(btn.dataset.orderId);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  };
 
  bind('.js-view-order', id => { if (handlers.onView) handlers.onView(id); });
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
 
// RENDER PHARMACY SELECTOR
/**
 * Populates a <select> with Internal Pharmacy first, then linked partners.
 */
function renderPharmacySelector(select, linkedPharmacies, internalPharmacyId) {
  if (!select) return;
 
  const options = [];
 
  if (internalPharmacyId) {
    options.push(
      `<option value="${internalPharmacyId}" data-type="internal">Internal Pharmacy</option>`
    );
  }
 
  linkedPharmacies.forEach(link => {
    const org = link.organizations;
    if (!org || org.id === internalPharmacyId) return;
    options.push(
      `<option value="${org.id}" data-type="external">${escapeHtml(org.name)} (Partner)</option>`
    );
  });
 
  if (!options.length) {
    options.push(`<option value="" disabled>No pharmacies configured</option>`);
  }
 
  select.innerHTML = `<option value="">— Select Pharmacy —</option>` + options.join('');
}
 
// EXPORTS
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
 