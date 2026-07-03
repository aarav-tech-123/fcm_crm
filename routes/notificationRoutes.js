const express = require('express');
const router  = express.Router();
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/notificationController');

router.use(authMiddleware);

// ─── Device Token ──────────────────────────────────────────────────────────────
router.post('/token', registerToken);

// ─── History ───────────────────────────────────────────────────────────────────
router.get('/history', getNotificationHistory);

// ─── Custom / Broadcast (admin only) ──────────────────────────────────────────
router.post('/send',      requireRole('SuperAdmin', 'Admin', 'Agent'), sendCustomNotification);
router.post('/broadcast', requireRole('SuperAdmin', 'Admin'), broadcastNotification);

// ─── ContactCallbacks ──────────────────────────────────────────────────────────
router.post('/callback/scheduled',  triggerCallbackScheduled);
router.post('/callback/completed',  triggerCallbackCompleted);
router.post('/callback/cancelled',  triggerCallbackCancelled);

// ─── ContactAppointments ───────────────────────────────────────────────────────
router.post('/appointment/booked',       triggerAppointmentBooked);
router.post('/appointment/rescheduled',  triggerAppointmentRescheduled);
router.post('/appointment/completed',    triggerAppointmentCompleted);
router.post('/appointment/cancelled',    triggerAppointmentCancelled);

// ─── PaymentStructure ──────────────────────────────────────────────────────────
router.post('/payment/received',   triggerPaymentReceived);
router.post('/payment/due',        triggerPaymentDue);
router.post('/payment/cancelled',  triggerPaymentCancelled);

// ─── ContactReminders ──────────────────────────────────────────────────────────
router.post('/reminder/created',    triggerReminderCreated);
router.post('/reminder/completed',  triggerReminderCompleted);

module.exports = router;
