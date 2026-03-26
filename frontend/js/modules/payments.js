/**
 * payments.js — Minza Health Payments Module
 *
 * Responsibility (ONE): Everything to do with bills and payments.
 *  - Create a bill for a visit
 *  - Record a payment (cash or MoMo)
 *  - Fetch payment history
 *  - Calculate outstanding balance
 *  - Render payment list
 */

import { apiRequest }           from '../services/api.js';
import { getOrgId }             from './auth.js';
import { fmtUGX, fmtDate }      from '../utils/format.js';
import { showToast }            from '../utils/ui.js';

// ─── BILL STATUS ───────────────────────────────────────────────────────────────
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

// ─── FETCH ─────────────────────────────────────────────────────────────────────
async function fetchBillByVisit(visitId) {
  const data = await apiRequest(
    `/bills?visit_id=eq.${visitId}&select=*,payments(*)&limit=1`
  );
  return data?.[0] || null;
}

async function fetchPaymentsByBill(billId) {
  const data = await apiRequest(
    `/payments?bill_id=eq.${billId}&order=created_at.desc`
  );
  return data || [];
}

// ─── CREATE BILL ───────────────────────────────────────────────────────────────
async function createBill(visitId, totalAmount) {
  if (!visitId) throw new Error('Visit ID required.');
  if (totalAmount <= 0) throw new Error('Total amount must be greater than zero.');

  const result = await apiRequest('/bills', 'POST', {
    visit_id:     visitId,
    total_amount: totalAmount,
    status:       BILL_STATUS.UNPAID,
  });

  if (result) return Array.isArray(result) ? result[0] : result;
  return null;
}

// ─── CREATE PAYMENT ────────────────────────────────────────────────────────────
/**
 * recordPayment — records a payment against a bill.
 * Also updates the bill status based on how much has been paid.
 *
 * @param {string} billId
 * @param {number} amount
 * @param {'cash'|'momo'} method
 * @param {string|null} reference  - MoMo reference, null for cash
 */
async function recordPayment(billId, amount, method, reference = null) {
  if (!billId)  throw new Error('Bill ID required.');
  if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero.');
  if (!Object.values(PAYMENT_METHOD).includes(method)) {
    throw new Error('Invalid payment method. Use cash or momo.');
  }

  // 1. Insert payment record
  const payResult = await apiRequest('/payments', 'POST', {
    bill_id:   billId,
    amount,
    method,
    status:    method === PAYMENT_METHOD.CASH
                 ? PAYMENT_STATUS.SUCCESS
                 : PAYMENT_STATUS.PENDING,
    reference: reference || null,
  });

  if (!payResult) return null; // offline

  const payment = Array.isArray(payResult) ? payResult[0] : payResult;

  // 2. Recalculate bill status
  await _recalculateBillStatus(billId);

  return payment;
}

async function _recalculateBillStatus(billId) {
  const bill = await fetchBillByVisit(null); // we need the bill directly
  const billData = await apiRequest(`/bills?id=eq.${billId}&select=*,payments(*)`);
  if (!billData?.[0]) return;

  const b = billData[0];
  const successfulPayments = (b.payments || []).filter(p => p.status === PAYMENT_STATUS.SUCCESS);
  const totalPaid = successfulPayments.reduce((s, p) => s + Number(p.amount), 0);
  const total     = Number(b.total_amount);

  let newStatus = BILL_STATUS.UNPAID;
  if (totalPaid >= total) newStatus = BILL_STATUS.PAID;
  else if (totalPaid > 0) newStatus = BILL_STATUS.PARTIAL;

  await apiRequest(`/bills?id=eq.${billId}`, 'PATCH', { status: newStatus });
}

// ─── CONFIRM MOMO ──────────────────────────────────────────────────────────────
/**
 * confirmMomoPayment — marks a MoMo payment as successful.
 * Called after the MoMo callback or manual confirmation.
 */
async function confirmMomoPayment(paymentId, billId) {
  await apiRequest(
    `/payments?id=eq.${paymentId}`,
    'PATCH',
    { status: PAYMENT_STATUS.SUCCESS }
  );
  await _recalculateBillStatus(billId);
}

// ─── RENDER ────────────────────────────────────────────────────────────────────
function renderBillSummary(container, bill) {
  if (!container) return;

  if (!bill) {
    container.innerHTML = `<div class="empty-state">No bill created yet.</div>`;
    return;
  }

  const payments     = bill.payments || [];
  const totalPaid    = payments
    .filter(p => p.status === PAYMENT_STATUS.SUCCESS)
    .reduce((s, p) => s + Number(p.amount), 0);
  const outstanding  = Math.max(0, Number(bill.total_amount) - totalPaid);

  const statusBadge = s => {
    const map = {
      unpaid:  { cls: 'badge--danger',  label: 'Unpaid' },
      partial: { cls: 'badge--warn',    label: 'Partial' },
      paid:    { cls: 'badge--success', label: 'Paid' },
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
        <span>Amount Paid</span>
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
      </div>
    ` : ''}`;
}

/**
 * bindPaymentForm — attaches submit logic to the payment form.
 */
function bindPaymentForm(form, billId, onSuccess) {
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = form.querySelector('[type="submit"]');
    const errEl  = form.querySelector('.form-error');
    const method = form.querySelector('[name="method"]')?.value;
    const amount = parseFloat(form.querySelector('[name="amount"]')?.value);
    const ref    = form.querySelector('[name="reference"]')?.value?.trim() || null;

    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
    if (errEl) errEl.textContent = '';

    try {
      const payment = await recordPayment(billId, amount, method, ref);
      showToast(payment ? 'Payment recorded.' : 'Payment queued offline.');
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

// ─── EXPORTS ───────────────────────────────────────────────────────────────────
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