/**
 * Callback Notification Service
 *
 * Table: [CRM].[dbo].[ContactCallbacks]
 * Columns: id, contact_id, callback_date, callback_time, note,
 *          status, created_by, created_at, completed_at
 *
 * Joins:
 *   ContactCallbacks.created_by  → Users.id  (assigned agent)
 *   ContactCallbacks.contact_id  → Contacts.id (lead/customer)
 */

const { sendToDevice, getTokenForUser, getTokensForRole, logNotification } = require('../services/firebaseService');
const { query } = require('../config/db');
const { logger, formatDateTime, formatDate } = require('../utils/notificationHelper');

// ─── Fetch callback + related info ────────────────────────────────────────────

const getCallbackDetails = async (callbackId) => {
  const result = await query(
    `SELECT
       cb.id,
       cb.contact_id,
       cb.callback_date,
       cb.callback_time,
       cb.note,
       cb.status,
       cb.created_by       AS agent_id,
       u.name              AS agent_name,
       u.fcm_token         AS agent_token,
       c.name              AS contact_name,
       c.mobile            AS contact_phone
     FROM [CRM].[dbo].[ContactCallbacks] cb
     INNER JOIN [CRM].[dbo].[Users]    u ON u.id = cb.created_by
     INNER JOIN [CRM].[dbo].[Contacts] c ON c.id = cb.contact_id
     WHERE cb.id = @callbackId`,
    { callbackId }
  );
  return result.recordset[0] || null;
};

// ─── Notify: Callback Scheduled ───────────────────────────────────────────────

const notifyCallbackScheduled = async (callbackId) => {
  try {
    const cb = await getCallbackDetails(callbackId);
    if (!cb) throw new Error(`Callback #${callbackId} not found`);

    const when = `${formatDate(cb.callback_date)} at ${cb.callback_time || 'scheduled time'}`;
    const title = '📞 Callback Scheduled';
    const body  = `You have a callback with ${cb.contact_name} on ${when}`;

    if (cb.agent_token) {
      await sendToDevice(cb.agent_token, title, body, {
        type:       'CALLBACK_SCHEDULED',
        callbackId: String(callbackId),
        contactName: cb.contact_name,
        callbackDate: String(cb.callback_date),
        callbackTime: cb.callback_time || '',
      });
    } else {
      logger.warn(`No FCM token for agent #${cb.agent_id} (callback #${callbackId})`);
    }

    await logNotification({
      userId:        cb.agent_id,
      type:          'callback_scheduled',
      title,
      body,
      referenceId:   callbackId,
      referenceType: 'ContactCallbacks',
    });

    logger.info(`Callback scheduled notification sent | ID: ${callbackId}`);
  } catch (err) {
    logger.error(`notifyCallbackScheduled error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Callback Reminder (10-min warning, triggered by cron) ────────────

const notifyCallbackReminder = async (callbackId) => {
  try {
    const cb = await getCallbackDetails(callbackId);
    if (!cb || cb.status !== 'pending') return;

    const title = '⏰ Callback Reminder';
    const body  = `Callback with ${cb.contact_name} in ~10 minutes`;

    if (cb.agent_token) {
      await sendToDevice(cb.agent_token, title, body, {
        type:       'CALLBACK_REMINDER',
        callbackId: String(callbackId),
      });
    }

    await logNotification({
      userId:        cb.agent_id,
      type:          'callback_reminder',
      title,
      body,
      referenceId:   callbackId,
      referenceType: 'ContactCallbacks',
    });
  } catch (err) {
    logger.error(`notifyCallbackReminder error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Callback Completed ───────────────────────────────────────────────

const notifyCallbackCompleted = async (callbackId) => {
  try {
    const cb = await getCallbackDetails(callbackId);
    if (!cb) return;

    // Notify supervisors / admins that a callback was marked done
    const adminTokens = await getTokensForRole('Admin');
    const title = '✅ Callback Completed';
    const body  = `${cb.agent_name} completed callback with ${cb.contact_name}`;

    for (const token of adminTokens) {
      await sendToDevice(token, title, body, {
        type:       'CALLBACK_COMPLETED',
        callbackId: String(callbackId),
        agentName:  cb.agent_name,
      });
    }

    await logNotification({
      userId:        cb.agent_id,
      type:          'callback_completed',
      title,
      body,
      referenceId:   callbackId,
      referenceType: 'ContactCallbacks',
    });
  } catch (err) {
    logger.error(`notifyCallbackCompleted error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Callback Cancelled ───────────────────────────────────────────────

const notifyCallbackCancelled = async (callbackId) => {
  try {
    const cb = await getCallbackDetails(callbackId);
    if (!cb) return;

    const title = '❌ Callback Cancelled';
    const body  = `Callback with ${cb.contact_name} has been cancelled`;

    if (cb.agent_token) {
      await sendToDevice(cb.agent_token, title, body, {
        type:       'CALLBACK_CANCELLED',
        callbackId: String(callbackId),
      });
    }

    await logNotification({
      userId:        cb.agent_id,
      type:          'callback_cancelled',
      title,
      body,
      referenceId:   callbackId,
      referenceType: 'ContactCallbacks',
    });
  } catch (err) {
    logger.error(`notifyCallbackCancelled error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  notifyCallbackScheduled,
  notifyCallbackReminder,
  notifyCallbackCompleted,
  notifyCallbackCancelled,
};
