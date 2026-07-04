/**
 * Reminder Notification Service
 *
 * Table: [CRM].[dbo].[ContactReminders]
 * Columns: id, contact_id, reminder_type, title, description,
 *          reminder_date, priority, status, created_by, created_at, completed_at
 *
 * Joins:
 *   ContactReminders.created_by → Users.id
 *   ContactReminders.contact_id → Contacts.id
 */

const { sendToDevice, getTokensForRole, logNotification } = require('./firebaseService');
const { query } = require('../config/db');
const { logger, formatDateTime } = require('../utils/notificationHelper');

// ─── Fetch reminder + related info ────────────────────────────────────────────

const getReminderDetails = async (reminderId) => {
  const result = await query(
    `SELECT
       r.id,
       r.contact_id,
       r.reminder_type,
       r.title,
       r.description,
       r.reminder_date,
       r.priority,
       r.status,
       r.created_by      AS agent_id,
       u.name            AS agent_name,
       u.fcm_token       AS agent_token,
       c.client_name            AS contact_name
     FROM [CRM].[dbo].[ContactReminders] r
     INNER JOIN [CRM].[dbo].[Users]    u ON u.id = r.created_by
     INNER JOIN [CRM].[dbo].[Contacts] c ON c.id = r.contact_id
     WHERE r.id = @reminderId`,
    { reminderId }
  );
  return result.recordset[0] || null;
};

// ─── Priority → emoji map ──────────────────────────────────────────────────────

const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

// ─── Notify: Reminder Created ──────────────────────────────────────────────────

const notifyReminderCreated = async (reminderId) => {
  try {
    const rem = await getReminderDetails(reminderId);
    if (!rem) throw new Error(`Reminder #${reminderId} not found`);

    const emoji   = priorityEmoji[rem.priority] || '🔔';
    const dateStr = formatDateTime(rem.reminder_date);
    const title   = `${emoji} Reminder Set`;
    const body    = `${rem.title} for ${rem.contact_name} on ${dateStr}`;

    if (rem.agent_token) {
      await sendToDevice(rem.agent_token, title, body, {
        type:           'REMINDER_CREATED',
        reminderId:     String(reminderId),
        reminderType:   rem.reminder_type || '',
        priority:       rem.priority || 'normal',
        contactName:    rem.contact_name,
        reminderDate:   String(rem.reminder_date),
      });
    }

    await logNotification({
      userId:        rem.agent_id,
      type:          'reminder_created',
      title,
      body,
      referenceId:   reminderId,
      referenceType: 'ContactReminders',
    });

    logger.info(`Reminder created notification sent | ID: ${reminderId}`);
  } catch (err) {
    logger.error(`notifyReminderCreated error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Reminder Due (triggered by cron — fires at reminder_date) ────────

const notifyReminderDue = async (reminderId) => {
  try {
    const rem = await getReminderDetails(reminderId);
    if (!rem || rem.status === 'Completed') return;

    const emoji = priorityEmoji[rem.priority] || '⏰';
    const title = `${emoji} Reminder Due Now`;
    const body  = `${rem.title} — ${rem.contact_name}${rem.description ? ': ' + rem.description : ''}`;

    if (rem.agent_token) {
      await sendToDevice(rem.agent_token, title, body, {
        type:         'REMINDER_DUE',
        reminderId:   String(reminderId),
        reminderType: rem.reminder_type || '',
        priority:     rem.priority || 'normal',
      });
    }

    // Escalate high-priority to admins as well
    if (rem.priority === 'high') {
      const adminTokens = await getTokensForRole('Admin');
      for (const token of adminTokens) {
        await sendToDevice(token, `🔴 High Priority Reminder Due`, body, {
          type:       'REMINDER_DUE',
          reminderId: String(reminderId),
          agentName:  rem.agent_name,
        });
      }
    }

    await logNotification({
      userId:        rem.agent_id,
      type:          'reminder_due',
      title,
      body,
      referenceId:   reminderId,
      referenceType: 'ContactReminders',
    });

    logger.info(`Reminder due notification sent | ID: ${reminderId}`);
  } catch (err) {
    logger.error(`notifyReminderDue error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Reminder Completed ───────────────────────────────────────────────

const notifyReminderCompleted = async (reminderId) => {
  try {
    const rem = await getReminderDetails(reminderId);
    if (!rem) return;

    const title = '✅ Reminder Completed';
    const body  = `${rem.title} for ${rem.contact_name} has been marked complete`;

    // Only push to admin — agent already knows they completed it
    const adminTokens = await getTokensForRole('Admin');
    for (const token of adminTokens) {
      await sendToDevice(token, title, body, {
        type:       'REMINDER_COMPLETED',
        reminderId: String(reminderId),
        agentName:  rem.agent_name,
      });
    }

    await logNotification({
      userId:        rem.agent_id,
      type:          'reminder_completed',
      title,
      body,
      referenceId:   reminderId,
      referenceType: 'ContactReminders',
    });
  } catch (err) {
    logger.error(`notifyReminderCompleted error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  notifyReminderCreated,
  notifyReminderDue,
  notifyReminderCompleted,
};
