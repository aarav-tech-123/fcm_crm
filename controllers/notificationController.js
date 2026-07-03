const {
  sendToDevice, sendToMultipleDevices, sendToTopic,
  getTokenForUser, saveDeviceToken,
} = require('../services/firebaseService');
const { notifyCallbackScheduled, notifyCallbackCompleted, notifyCallbackCancelled } = require('../services/callbackNotificationService');
const { notifyAppointmentBooked, notifyAppointmentRescheduled, notifyAppointmentCompleted, notifyAppointmentCancelled } = require('../services/appointmentNotificationService');
const { notifyPaymentReceived, notifyPaymentDue, notifyPaymentCancelled } = require('../services/paymentNotificationService');
const { notifyReminderCreated, notifyReminderCompleted } = require('../services/reminderNotificationService');
const { query } = require('../config/db');
const { logger, apiResponse } = require('../utils/notificationHelper');

// ─── Device Token ──────────────────────────────────────────────────────────────

/**
 * POST /api/notifications/token
 * Save FCM token to Users.fcm_token for the authenticated user
 */
const registerToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;


    if (!fcmToken) return res.status(400).json(apiResponse(false, 'fcmToken is required'));

    await saveDeviceToken(req.user.id, fcmToken);
    res.json(apiResponse(true, 'Device token registered'));
  } catch (err) {
    logger.error(`registerToken error: ${err.message}`);
    res.status(500).json(apiResponse(false, 'Failed to register token'));
  }
};

// ─── Custom / Broadcast ────────────────────────────────────────────────────────

const sendCustomNotification = async (req, res) => {
  try {
    const { userId, title, body, data = {} } = req.body;


    if (!userId || !title || !body)
      return res.status(400).json(apiResponse(false, 'userId, title, and body are required'));

    const token = await getTokenForUser(userId);
    if (!token) return res.status(404).json(apiResponse(false, 'No FCM token found for user'));



    const result = await sendToDevice(token, title, body, data);

    res.json(apiResponse(true, 'Notification sent', result));
  } catch (err) {
    logger.error(`sendCustomNotification error: ${err.message}`);
    res.status(500).json(apiResponse(false, 'Failed to send notification'));
  }
};

const broadcastNotification = async (req, res) => {
  try {
    const { topic, title, body, data = {} } = req.body;
    if (!topic || !title || !body)
      return res.status(400).json(apiResponse(false, 'topic, title, and body are required'));

    const result = await sendToTopic(topic, title, body, data);
    res.json(apiResponse(true, 'Broadcast sent', result));
  } catch (err) {
    logger.error(`broadcastNotification error: ${err.message}`);
    res.status(500).json(apiResponse(false, 'Failed to broadcast'));
  }
};

// ─── Callback ─────────────────────────────────────────────────────────────────

const triggerCallbackScheduled = async (req, res) => {
  try {
    const { callbackId } = req.body;
    if (!callbackId) return res.status(400).json(apiResponse(false, 'callbackId is required'));
    await notifyCallbackScheduled(callbackId);
    res.json(apiResponse(true, 'Callback scheduled notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerCallbackCompleted = async (req, res) => {
  try {
    const { callbackId } = req.body;
    if (!callbackId) return res.status(400).json(apiResponse(false, 'callbackId is required'));
    await notifyCallbackCompleted(callbackId);
    res.json(apiResponse(true, 'Callback completed notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerCallbackCancelled = async (req, res) => {
  try {
    const { callbackId } = req.body;
    if (!callbackId) return res.status(400).json(apiResponse(false, 'callbackId is required'));
    await notifyCallbackCancelled(callbackId);
    res.json(apiResponse(true, 'Callback cancelled notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

// ─── Appointment ──────────────────────────────────────────────────────────────

const triggerAppointmentBooked = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json(apiResponse(false, 'appointmentId is required'));
    await notifyAppointmentBooked(appointmentId);
    res.json(apiResponse(true, 'Appointment booked notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerAppointmentRescheduled = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json(apiResponse(false, 'appointmentId is required'));
    await notifyAppointmentRescheduled(appointmentId);
    res.json(apiResponse(true, 'Appointment rescheduled notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerAppointmentCompleted = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json(apiResponse(false, 'appointmentId is required'));
    await notifyAppointmentCompleted(appointmentId);
    res.json(apiResponse(true, 'Appointment completed notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerAppointmentCancelled = async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;
    if (!appointmentId) return res.status(400).json(apiResponse(false, 'appointmentId is required'));
    await notifyAppointmentCancelled(appointmentId, reason);
    res.json(apiResponse(true, 'Appointment cancelled notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

// ─── Payment ──────────────────────────────────────────────────────────────────

const triggerPaymentReceived = async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json(apiResponse(false, 'paymentId is required'));
    await notifyPaymentReceived(paymentId);
    res.json(apiResponse(true, 'Payment received notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerPaymentDue = async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json(apiResponse(false, 'paymentId is required'));
    await notifyPaymentDue(paymentId);
    res.json(apiResponse(true, 'Payment due notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerPaymentCancelled = async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json(apiResponse(false, 'paymentId is required'));
    await notifyPaymentCancelled(paymentId);
    res.json(apiResponse(true, 'Payment cancelled notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

// ─── Reminder ─────────────────────────────────────────────────────────────────

const triggerReminderCreated = async (req, res) => {
  try {
    const { reminderId } = req.body;
    if (!reminderId) return res.status(400).json(apiResponse(false, 'reminderId is required'));
    await notifyReminderCreated(reminderId);
    res.json(apiResponse(true, 'Reminder created notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

const triggerReminderCompleted = async (req, res) => {
  try {
    const { reminderId } = req.body;
    if (!reminderId) return res.status(400).json(apiResponse(false, 'reminderId is required'));
    await notifyReminderCompleted(reminderId);
    res.json(apiResponse(true, 'Reminder completed notification sent'));
  } catch (err) { res.status(500).json(apiResponse(false, err.message)); }
};

// ─── Notification History ─────────────────────────────────────────────────────

const getNotificationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT id, type, title, body, reference_id, reference_type, status, created_at
      FROM [CRM].[dbo].[NotificationLogs]
      WHERE user_id = @userId
    `;
    const params = { userId };

    if (type) { sql += ` AND type = @type`; params.type = type; }
    sql += ` ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    params.offset = offset;
    params.limit  = parseInt(limit);

    const result = await query(sql, params);

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM [CRM].[dbo].[NotificationLogs]
       WHERE user_id = @userId${type ? ' AND type = @type' : ''}`,
      type ? { userId, type } : { userId }
    );

    res.json(apiResponse(true, 'Notification history fetched', {
      notifications: result.recordset,
      pagination: {
        total: countResult.recordset[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.recordset[0].total / parseInt(limit)),
      },
    }));
  } catch (err) {
    logger.error(`getNotificationHistory error: ${err.message}`);
    res.status(500).json(apiResponse(false, 'Failed to fetch history'));
  }
};

module.exports = {
  registerToken,
  sendCustomNotification,
  broadcastNotification,
  triggerCallbackScheduled,
  triggerCallbackCompleted,
  triggerCallbackCancelled,
  triggerAppointmentBooked,
  triggerAppointmentRescheduled,
  triggerAppointmentCompleted,
  triggerAppointmentCancelled,
  triggerPaymentReceived,
  triggerPaymentDue,
  triggerPaymentCancelled,
  triggerReminderCreated,
  triggerReminderCompleted,
  getNotificationHistory,
};
