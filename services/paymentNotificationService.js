/**
 * Payment Notification Service
 *
 * Table: [CRM].[dbo].[PaymentStructure]
 * Columns: id, contact_id, sr_no, payment_name, amount, hst,
 *          payment_date, status, description, created_at, updated_at
 *
 * Joins:
 *   PaymentStructure.contact_id → Contacts.id
 *   Contacts.assigned_to        → Users.id  (agent responsible)
 */

const { sendToDevice, getTokenForUser, getTokensForRole, logNotification } = require('./firebaseService');
const { query } = require('../config/db');
const { logger, formatDate, formatCurrency } = require('../utils/notificationHelper');

// ─── Fetch payment + related info ─────────────────────────────────────────────

const getPaymentDetails = async (paymentId) => {
  const result = await query(
    `SELECT
       ps.id,
       ps.contact_id,
       ps.sr_no,
       ps.payment_name,
       ps.amount,
       ps.hst,
       ps.payment_date,
       ps.status,
       ps.description,
       c.name          AS contact_name,
       c.assigned_to   AS agent_id,
       u.name          AS agent_name,
       u.fcm_token     AS agent_token
     FROM [CRM].[dbo].[PaymentStructure] ps
     INNER JOIN [CRM].[dbo].[Contacts] c ON c.id = ps.contact_id
     LEFT  JOIN [CRM].[dbo].[Users]    u ON u.id = c.assigned_to
     WHERE ps.id = @paymentId`,
    { paymentId }
  );
  return result.recordset[0] || null;
};

// ─── Notify: Payment Received (status → 'paid') ───────────────────────────────

const notifyPaymentReceived = async (paymentId) => {
  try {
    const pmt = await getPaymentDetails(paymentId);
    if (!pmt) throw new Error(`Payment #${paymentId} not found`);

    const totalAmount = parseFloat(pmt.amount) + parseFloat(pmt.hst || 0);
    const amountStr   = formatCurrency(totalAmount);
    const label       = pmt.payment_name || `Payment #${pmt.sr_no}`;

    const title = '✅ Payment Received';
    const body  = `${label} of ${amountStr} received from ${pmt.contact_name}`;

    // Notify assigned agent
    if (pmt.agent_token) {
      await sendToDevice(pmt.agent_token, title, body, {
        type:      'PAYMENT_RECEIVED',
        paymentId: String(paymentId),
        amount:    String(totalAmount),
        label,
      });
    }

    // Notify all admins
    const adminTokens = await getTokensForRole('Admin');
    for (const token of adminTokens) {
      await sendToDevice(token, title, body, {
        type:        'PAYMENT_RECEIVED',
        paymentId:   String(paymentId),
        amount:      String(totalAmount),
        contactName: pmt.contact_name,
      });
    }

    await logNotification({
      userId:        pmt.agent_id,
      type:          'payment_received',
      title,
      body,
      referenceId:   paymentId,
      referenceType: 'PaymentStructure',
    });

    logger.info(`Payment received notification sent | PaymentID: ${paymentId} | Amount: ${amountStr}`);
  } catch (err) {
    logger.error(`notifyPaymentReceived error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Payment Due (upcoming payment_date, triggered by cron) ───────────

const notifyPaymentDue = async (paymentId) => {
  try {
    const pmt = await getPaymentDetails(paymentId);
    if (!pmt || pmt.status === 'paid') return;

    const totalAmount = parseFloat(pmt.amount) + parseFloat(pmt.hst || 0);
    const amountStr   = formatCurrency(totalAmount);
    const dateStr     = formatDate(pmt.payment_date);
    const label       = pmt.payment_name || `Payment #${pmt.sr_no}`;

    const title = '🔔 Payment Due Tomorrow';
    const body  = `${label} of ${amountStr} for ${pmt.contact_name} is due on ${dateStr}`;

    if (pmt.agent_token) {
      await sendToDevice(pmt.agent_token, title, body, {
        type:        'PAYMENT_DUE',
        paymentId:   String(paymentId),
        amount:      String(totalAmount),
        paymentDate: String(pmt.payment_date),
      });
    }

    await logNotification({
      userId:        pmt.agent_id,
      type:          'payment_due',
      title,
      body,
      referenceId:   paymentId,
      referenceType: 'PaymentStructure',
    });

    logger.info(`Payment due notification sent | PaymentID: ${paymentId}`);
  } catch (err) {
    logger.error(`notifyPaymentDue error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Payment Overdue (triggered by cron) ──────────────────────────────

const notifyPaymentOverdue = async (paymentId) => {
  try {
    const pmt = await getPaymentDetails(paymentId);
    if (!pmt || pmt.status === 'paid') return;

    const totalAmount = parseFloat(pmt.amount) + parseFloat(pmt.hst || 0);
    const amountStr   = formatCurrency(totalAmount);
    const label       = pmt.payment_name || `Payment #${pmt.sr_no}`;

    const title = '⚠️ Payment Overdue';
    const body  = `${label} of ${amountStr} from ${pmt.contact_name} is overdue. Please follow up.`;

    // Notify agent
    if (pmt.agent_token) {
      await sendToDevice(pmt.agent_token, title, body, {
        type:      'PAYMENT_OVERDUE',
        paymentId: String(paymentId),
        amount:    String(totalAmount),
      });
    }

    // Notify admins
    const adminTokens = await getTokensForRole('Admin');
    for (const token of adminTokens) {
      await sendToDevice(token, title, body, {
        type:        'PAYMENT_OVERDUE',
        paymentId:   String(paymentId),
        contactName: pmt.contact_name,
      });
    }

    await logNotification({
      userId:        pmt.agent_id,
      type:          'payment_overdue',
      title,
      body,
      referenceId:   paymentId,
      referenceType: 'PaymentStructure',
      status:        'overdue',
    });
  } catch (err) {
    logger.error(`notifyPaymentOverdue error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Payment Cancelled / Reversed ─────────────────────────────────────

const notifyPaymentCancelled = async (paymentId) => {
  try {
    const pmt = await getPaymentDetails(paymentId);
    if (!pmt) return;

    const totalAmount = parseFloat(pmt.amount) + parseFloat(pmt.hst || 0);
    const amountStr   = formatCurrency(totalAmount);
    const label       = pmt.payment_name || `Payment #${pmt.sr_no}`;

    const title = '❌ Payment Cancelled';
    const body  = `${label} of ${amountStr} for ${pmt.contact_name} has been cancelled`;

    if (pmt.agent_token) {
      await sendToDevice(pmt.agent_token, title, body, {
        type:      'PAYMENT_CANCELLED',
        paymentId: String(paymentId),
      });
    }

    await logNotification({
      userId:        pmt.agent_id,
      type:          'payment_cancelled',
      title,
      body,
      referenceId:   paymentId,
      referenceType: 'PaymentStructure',
      status:        'cancelled',
    });
  } catch (err) {
    logger.error(`notifyPaymentCancelled error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  notifyPaymentReceived,
  notifyPaymentDue,
  notifyPaymentOverdue,
  notifyPaymentCancelled,
};
