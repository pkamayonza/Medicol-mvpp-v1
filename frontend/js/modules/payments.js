import { apiRequest }      from '../services/api.js';
import { fmtUGX, fmtDate } from '../utils/format.js';
import { showToast }       from '../utils/ui.js';

// CONSTANTS
export const BILL_STATUS = {
  UNPAID:  'unpaid',
  PARTIAL: 'partial',
  PAID:    'paid',
};

export const PAYMENT_METHOD = {
  CASH: 'cash',
  MOMO: 'momo',
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED:  'failed',
};

// FETCH 
async function _recalculateBillStatus(billId) {
  if (!billId) return;
  const billData = await apiRequest(`/bills?id=eq.${billId}&select=*,payments(*)`);
  if (!billData?.[0]) return;

  const b           = billData[0];
  const paidTotal   = (b.payments || [])
    .filter(p => p.status === PAYMENT_STATUS.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);
  const total       = Number(b.total_amount);
  const newStatus   = paidTotal >= total ? BILL_STATUS.PAID
                    : paidTotal > 0      ? BILL_STATUS.PARTIAL
                    :                      BILL_STATUS.UNPAID;

  if (newStatus !== b.status) {
    await apiRequest(`/bills?id=eq.${billId}`, 'PATCH', { status: newStatus });
  }
}

async function fetchPaymentsByBill(billId) {
  const data = await apiRequest(
    `/payments?bill_id=eq.${billId}&order=created_at.desc`
  );
  return data || [];
}

// ─CREATE BILL
async function createBill(visitId, totalAmount) {
  if (!visitId)       throw new Error('Visit ID required.');
  if (totalAmount <= 0) throw new Error('Total amount must be greater than zero.');

  const result = await apiRequest('/bills', 'POST', {
    visit_id:     visitId,
    total_amount: totalAmount,
    status:       BILL_STATUS.UNPAID,
  });
  if (result) return Array.isArray(result) ? result[0] : result;
  return null;
}

// RECORD PAYMENTS
/**
 * @param {string}      billId
 * @param {number}      amount
 * @param {'cash'|'momo'} method
 * @param {string|null} reference  MoMo transaction ID
 */
async function recordPayment(billId, amount, method, reference = null) {
  if (!billId) throw new Error('Bill ID required.');
  if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
  if (!Object.values(PAYMENT_METHOD).includes(method)) {
    throw new Error('Invalid payment method. Use cash or momo.');
  }

  const payResult = await apiRequest('/payments', 'POST', {
    bill_id:   billId,
    amount,
    method,
    // Cash is immediately successful; MoMo waits for confirmation
    status:    method === PAYMENT_METHOD.CASH
                 ? PAYMENT_STATUS.SUCCESS
                 : PAYMENT_STATUS.PENDING,
    reference: reference || null,
  });

  if (!payResult) return null; // offline queued

  const payment = Array.isArray(payResult) ? payResult[0] : payResult;

  // Recalculate bill status in the background — don't block the UI
  _recalculateBillStatus(billId).catch(() => {});

  return payment;
}

// RECALCULATE BILL STATUS
// Internal helper. Fetches the bill directly by ID (not via visitId).
async function _recalculateBillStatus(billId) {
  if (!billId) return;

  const billData = await apiRequest(
    `/bills?id=eq.${billId}&select=*,payments(*)`
  );
  if (!billData?.[0]) return;

  const b              = billData[0];
  const successPayments = (b.payments || []).filter(p => p.status === PAYMENT_STATUS.SUCCESS);
  const totalPaid       = successPayments.reduce((s, p) => s + Number(p.amount), 0);
  const total           = Number(b.total_amount);

  let newStatus = BILL_STATUS.UNPAID;
  if (totalPaid >= total) newStatus = BILL_STATUS.PAID;
  else if (totalPaid > 0) newStatus = BILL_STATUS.PARTIAL;

  // Only PATCH if status actually changed
  if (newStatus !== b.status) {
    await apiRequest(`/bills?id=eq.${billId}`, 'PATCH', { status: newStatus });
  }
}

// CONFIRM MOMO
async function confirmMomoPayment(paymentId, billId) {
  await apiRequest(`/payments?id=eq.${paymentId}`, 'PATCH', { status: PAYMENT_STATUS.SUCCESS });
  await _recalculateBillStatus(billId);
}

// RENDER BILL SUMMARY
function renderBillSummary(container, bill) {
  if (!container) return;

  if (!bill) {
    container.innerHTML = `<div class="empty-state">No bill created yet.</div>`;
    return;
  }

  const payments   = bill.payments || [];
  const totalPaid  = payments
    .filter(p => p.status === PAYMENT_STATUS.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, Number(bill.total_amount) - totalPaid);

  const statusBadge = s => {
    const map = {
      unpaid:  { cls: 'badge--danger',  label: 'Unpaid'  },
      partial: { cls: 'badge--warn',    label: 'Partial' },
      paid:    { cls: 'badge--success', label: 'Paid'    },
    };
    const { cls, label } = map[s] || { cls: 'badge--neutral', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };

  container.innerHTML = `
    <div class="bill-summary">
      <div class="bill-summary__row">
        <span>Total Amount</span>
        <strong>${fmtUGX(bill.total_amount)}</strong>
      </div>
      <div class="bill-summary__row">
        <span>Paid</span>
        <strong class="text-success">${fmtUGX(totalPaid)}</strong>
      </div>
      <div class="bill-summary__row bill-summary__row--outstanding">
        <span>Outstanding</span>
        <strong class="${outstanding > 0 ? 'text-danger' : 'text-success'}">${fmtUGX(outstanding)}</strong>
      </div>
      <div class="bill-summary__row">
        <span>Status</span>
        ${statusBadge(bill.status)}
      </div>
    </div>
    ${payments.length ? `
      <div class="payment-history">
        <div class="section-label">Payment History</div>
        ${payments.map(p => `
          <div class="payment-row">
            <span class="payment-row__method">${p.method}</span>
            <span class="payment-row__amount">${fmtUGX(p.amount)}</span>
            <span class="payment-row__ref text-muted text-sm">${p.reference || ''}</span>
            <span class="badge ${p.status === 'success' ? 'badge--success' : 'badge--warn'}">${p.status}</span>
            <span class="text-muted text-sm">${fmtDate(p.created_at)}</span>
          </div>
        `).join('')}
      </div>` : ''}`;
}

// BIND PAYMENT FORM
/**
 * Attaches submit logic. Safe to call multiple times — uses flag guard.
 * @param {HTMLFormElement} form
 * @param {string}          billId
 * @param {Function}        onSuccess  called with payment object
 */
function bindPaymentForm(form, billId, onSuccess) {
  if (!form || form._paymentBound) return;
  form._paymentBound = true;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = form.querySelector('[type="submit"]');
    const errEl  = form.querySelector('.form-error');
    const method = form.querySelector('[name="method"]')?.value;
    const amount = parseFloat(form.querySelector('[name="amount"]')?.value);
    const ref    = form.querySelector('[name="reference"]')?.value?.trim() || null;

    if (btn)  { btn.disabled = true; btn.textContent = 'Processing…'; }
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    try {
      if (!method) throw new Error('Select a payment method.');
      const payment = await recordPayment(billId, amount, method, ref);
      showToast(payment ? 'Payment recorded.' : 'Payment queued offline.', payment ? 'success' : 'warn');
      form.reset();
      if (onSuccess) onSuccess(payment);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      else showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Record Payment'; }
    }
  });
}

// EXPORTS
export {
  fetchBillByVisit,
  fetchPaymentsByBill,
  createBill,
  recordPayment,
  confirmMomoPayment,
  renderBillSummary,
  bindPaymentForm,
  BILL_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
};