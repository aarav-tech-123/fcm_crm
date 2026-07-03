/**
 * Appointment Notification Service
 *
 * Table: [CRM].[dbo].[ContactAppointments]
 * Columns: id, contact_id, meeting_id, title, description,
 *          appointment_date, status, priority, created_by, created_at,
 *          updated_at, completed_by, completed_at, note, slot_id, entity_type
 *
 * Joins:
 *   ContactAppointments.created_by  → Users.id  (agent who created)
 *   ContactAppointments.completed_by → Users.id (agent who completed)
 *   ContactAppointments.contact_id  → Contacts.id
 */

const { sendToDevice, getTokenForUser, getTokensForRole, logNotification } = require('../services/firebaseService');
const { query } = require('../config/db');
const { logger, formatDateTime } = require('../utils/notificationHelper');

// ─── Fetch appointment + related info ─────────────────────────────────────────

const getAppointmentDetails = async (appointmentId) => {
  const result = await query(
    `SELECT
       a.id,
       a.contact_id,
       a.title             AS appt_title,
       a.description,
       a.appointment_date,
       a.status,
       a.priority,
       a.note,
       a.entity_type,
       a.created_by        AS agent_id,
       u.name              AS agent_name,
       u.fcm_token         AS agent_token,
       c.name              AS contact_name
     FROM [CRM].[dbo].[ContactAppointments] a
     INNER JOIN [CRM].[dbo].[Users]    u ON u.id = a.created_by
     INNER JOIN [CRM].[dbo].[Contacts] c ON c.id = a.contact_id
     WHERE a.id = @appointmentId`,
    { appointmentId }
  );
  return result.recordset[0] || null;
};

// ─── Notify: Appointment Booked ───────────────────────────────────────────────

const notifyAppointmentBooked = async (appointmentId) => {
  try {
    const appt = await getAppointmentDetails(appointmentId);
    if (!appt) throw new Error(`Appointment #${appointmentId} not found`);

    const dateStr = formatDateTime(appt.appointment_date);
    const apptLabel = appt.appt_title || 'Appointment';

    const title = '📅 New Appointment Booked';
    const body  = `${apptLabel} with ${appt.contact_name} on ${dateStr}`;

    if (appt.agent_token) {
      await sendToDevice(appt.agent_token, title, body, {
        type:            'APPOINTMENT_BOOKED',
        appointmentId:   String(appointmentId),
        contactName:     appt.contact_name,
        appointmentDate: String(appt.appointment_date),
        priority:        appt.priority || 'normal',
      });
    } else {
      logger.warn(`No FCM token for agent #${appt.agent_id} (appointment #${appointmentId})`);
    }

    // Also alert admins for high-priority appointments
    if (appt.priority === 'high') {
      const adminTokens = await getTokensForRole('Admin');
      for (const token of adminTokens) {
        await sendToDevice(token, '🔴 High Priority Appointment', body, {
          type:          'APPOINTMENT_BOOKED',
          appointmentId: String(appointmentId),
          priority:      'high',
        });
      }
    }

    await logNotification({
      userId:        appt.agent_id,
      type:          'appointment_booked',
      title,
      body,
      referenceId:   appointmentId,
      referenceType: 'ContactAppointments',
    });

    logger.info(`Appointment booked notification sent | ID: ${appointmentId}`);
  } catch (err) {
    logger.error(`notifyAppointmentBooked error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Appointment Reminder (1-hour warning, triggered by cron) ─────────

const notifyAppointmentReminder = async (appointmentId) => {
  try {
    const appt = await getAppointmentDetails(appointmentId);
    if (!appt || appt.status === 'completed' || appt.status === 'cancelled') return;

    const dateStr = formatDateTime(appt.appointment_date);
    const title   = '⏰ Appointment Reminder';
    const body    = `${appt.appt_title || 'Appointment'} with ${appt.contact_name} in 1 hour (${dateStr})`;

    if (appt.agent_token) {
      await sendToDevice(appt.agent_token, title, body, {
        type:          'APPOINTMENT_REMINDER',
        appointmentId: String(appointmentId),
      });
    }

    await logNotification({
      userId:        appt.agent_id,
      type:          'appointment_reminder',
      title,
      body,
      referenceId:   appointmentId,
      referenceType: 'ContactAppointments',
    });
  } catch (err) {
    logger.error(`notifyAppointmentReminder error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Appointment Rescheduled ──────────────────────────────────────────

const notifyAppointmentRescheduled = async (appointmentId) => {
  try {
    const appt = await getAppointmentDetails(appointmentId);
    if (!appt) return;

    const newDate = formatDateTime(appt.appointment_date);
    const title   = '🔄 Appointment Rescheduled';
    const body    = `${appt.appt_title || 'Appointment'} with ${appt.contact_name} moved to ${newDate}`;

    if (appt.agent_token) {
      await sendToDevice(appt.agent_token, title, body, {
        type:          'APPOINTMENT_RESCHEDULED',
        appointmentId: String(appointmentId),
        newDate:       String(appt.appointment_date),
      });
    }

    await logNotification({
      userId:        appt.agent_id,
      type:          'appointment_rescheduled',
      title,
      body,
      referenceId:   appointmentId,
      referenceType: 'ContactAppointments',
    });
  } catch (err) {
    logger.error(`notifyAppointmentRescheduled error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Appointment Completed ────────────────────────────────────────────

const notifyAppointmentCompleted = async (appointmentId) => {
  try {
    const appt = await getAppointmentDetails(appointmentId);
    if (!appt) return;

    const title = '✅ Appointment Completed';
    const body  = `${appt.appt_title || 'Appointment'} with ${appt.contact_name} marked as completed`;

    // Notify admin/manager on completion
    const adminTokens = await getTokensForRole('Admin');
    for (const token of adminTokens) {
      await sendToDevice(token, title, body, {
        type:          'APPOINTMENT_COMPLETED',
        appointmentId: String(appointmentId),
        agentName:     appt.agent_name,
      });
    }

    await logNotification({
      userId:        appt.agent_id,
      type:          'appointment_completed',
      title,
      body,
      referenceId:   appointmentId,
      referenceType: 'ContactAppointments',
    });
  } catch (err) {
    logger.error(`notifyAppointmentCompleted error: ${err.message}`);
    throw err;
  }
};

// ─── Notify: Appointment Cancelled ────────────────────────────────────────────

const notifyAppointmentCancelled = async (appointmentId, reason = '') => {
  try {
    const appt = await getAppointmentDetails(appointmentId);
    if (!appt) return;

    const title = '❌ Appointment Cancelled';
    const body  = reason
      ? `${appt.appt_title || 'Appointment'} with ${appt.contact_name} cancelled. Reason: ${reason}`
      : `${appt.appt_title || 'Appointment'} with ${appt.contact_name} has been cancelled`;

    if (appt.agent_token) {
      await sendToDevice(appt.agent_token, title, body, {
        type:          'APPOINTMENT_CANCELLED',
        appointmentId: String(appointmentId),
        reason:        reason || '',
      });
    }

    await logNotification({
      userId:        appt.agent_id,
      type:          'appointment_cancelled',
      title,
      body,
      referenceId:   appointmentId,
      referenceType: 'ContactAppointments',
    });
  } catch (err) {
    logger.error(`notifyAppointmentCancelled error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  notifyAppointmentBooked,
  notifyAppointmentReminder,
  notifyAppointmentRescheduled,
  notifyAppointmentCompleted,
  notifyAppointmentCancelled,
};
