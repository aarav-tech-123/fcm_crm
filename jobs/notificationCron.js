/**
 * Notification Cron Jobs
 *
 * All times are IST (UTC+5:30). Cron expressions use UTC:
 *   IST 09:00 = UTC 03:30
 *   IST 10:00 = UTC 04:30
 */

const cron = require('node-cron');
const { query } = require('../config/db');
const { notifyCallbackReminder }     = require('../services/callbackNotificationService');
const { notifyAppointmentReminder }  = require('../services/appointmentNotificationService');
const { notifyPaymentDue, notifyPaymentOverdue } = require('../services/paymentNotificationService');
const { notifyReminderDue }          = require('../services/reminderNotificationService');
const { logger } = require('../utils/notificationHelper');

// ─── Helper ────────────────────────────────────────────────────────────────────

const runJob = async (name, fn) => {
  logger.info(`[CRON] Starting: ${name}`);
  try {
    await fn();
  } catch (err) {
    logger.error(`[CRON] ${name} failed: ${err.message}`);
  }
};

// ─── 1. ContactCallbacks — 10-min reminder (every 5 min) ──────────────────────
// Finds pending callbacks where callback_date+callback_time is in ~10 mins
// Uses reminder_sent flag — requires adding column: ALTER TABLE ContactCallbacks ADD reminder_sent BIT DEFAULT 0

const callbackReminderJob = cron.schedule(
  "* * * * *",
  () =>
    runJob("Callback Reminders", async () => {
      const result = await query(`
        DECLARE @NowIST DATETIME = DATEADD(MINUTE, 330, GETUTCDATE());

        SELECT id
        FROM [CRM].[dbo].[ContactCallbacks]
        WHERE status = 'Pending'
          AND ISNULL(reminder_sent, 0) = 0
          AND CAST(callback_date AS DATE) = CAST(@NowIST AS DATE)
          AND CAST(callback_time AS TIME) BETWEEN
                CAST(DATEADD(MINUTE, 8, @NowIST) AS TIME)
            AND CAST(DATEADD(MINUTE, 12, @NowIST) AS TIME)
      `);

      for (const row of result.recordset) {
        await notifyCallbackReminder(row.id);

        await query(
          `UPDATE [CRM].[dbo].[ContactCallbacks]
           SET reminder_sent = 1
           WHERE id = @id`,
          { id: row.id }
        );
      }


      if (result.recordset.length) {
        logger.info(
          `[CRON] Callback reminders sent: ${result.recordset.length}`
        );
      }
    }),
  { scheduled: false }
);

// ─── 2. ContactAppointments — 1-hour reminder (every 10 min) ──────────────────
// Requires: ALTER TABLE ContactAppointments ADD reminder_sent BIT DEFAULT 0

const appointmentReminderJob = cron.schedule('*/10 * * * *', () => runJob('Appointment Reminders', async () => {
  const result = await query(`
    SELECT id FROM [CRM].[dbo].[ContactAppointments]
    WHERE status NOT IN ('completed', 'cancelled')
      AND ISNULL(reminder_sent, 0) = 0
      AND appointment_date BETWEEN
            DATEADD(MINUTE, 55, GETDATE()) AND
            DATEADD(MINUTE, 65, GETDATE())
  `);

  for (const row of result.recordset) {
    await notifyAppointmentReminder(row.id);
    await query(
      `UPDATE [CRM].[dbo].[ContactAppointments] SET reminder_sent = 1 WHERE id = @id`,
      { id: row.id }
    );
  }

  if (result.recordset.length) logger.info(`[CRON] Appointment reminders sent: ${result.recordset.length}`);
}), { scheduled: false });

// ─── 3. ContactReminders — fire at reminder_date (every 5 min) ────────────────
// Requires: ALTER TABLE ContactReminders ADD reminder_sent BIT DEFAULT 0

const reminderDueJob = cron.schedule(
  "*/5 * * * *",
  () =>
    runJob("Reminder Due Alerts", async () => {
      try {
        const result = await query(`
          DECLARE @NowIST DATETIME = DATEADD(MINUTE, 330, GETUTCDATE());

          SELECT id
          FROM [CRM].[dbo].[ContactReminders]
          WHERE status <> 'Completed'
            AND reminder_date <= @NowIST
            AND (
                  last_notification_sent IS NULL
                  OR DATEADD(MINUTE, 15, last_notification_sent) <= @NowIST
                )
        `);


        for (const row of result.recordset) {
          try {
            await notifyReminderDue(row.id);

            await query(`
              DECLARE @NowIST DATETIME = DATEADD(MINUTE, 330, GETUTCDATE());

              UPDATE [CRM].[dbo].[ContactReminders]
              SET last_notification_sent = @NowIST
              WHERE id = @id
            `, {
              id: row.id,
            });

            logger.info(
              `[CRON] Reminder notification sent for Reminder ID: ${row.id}`
            );
          } catch (err) {
            logger.error(
              `[CRON] Failed to send reminder ${row.id}: ${err.message}`
            );
          }
        }

        logger.info(
          `[CRON] Processed ${result.recordset.length} reminder(s)`
        );
      } catch (err) {
        logger.error(`[CRON] Reminder Job Error: ${err.message}`);
      }
    }),
  { scheduled: false }
);

// ─── 4. PaymentStructure — due tomorrow (daily 9 AM IST = 03:30 UTC) ──────────
// Requires: ALTER TABLE PaymentStructure ADD due_reminder_sent BIT DEFAULT 0

const paymentDueJob = cron.schedule('30 3 * * *', () => runJob('Payment Due Reminders', async () => {
  const result = await query(`
    SELECT id FROM [CRM].[dbo].[PaymentStructure]
    WHERE status <> 'paid'
      AND ISNULL(due_reminder_sent, 0) = 0
      AND CAST(payment_date AS DATE) = CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)
  `);

  for (const row of result.recordset) {
    await notifyPaymentDue(row.id);
    await query(
      `UPDATE [CRM].[dbo].[PaymentStructure] SET due_reminder_sent = 1 WHERE id = @id`,
      { id: row.id }
    );
  }

  logger.info(`[CRON] Payment due reminders sent: ${result.recordset.length}`);
}), { scheduled: false });

// ─── 5. PaymentStructure — overdue (daily 10 AM IST = 04:30 UTC) ──────────────
// Requires: ALTER TABLE PaymentStructure ADD overdue_last_notified DATETIME NULL

const paymentOverdueJob = cron.schedule('30 4 * * *', () => runJob('Payment Overdue Alerts', async () => {
  // Update status to 'overdue' for all past-due unpaid payments
  await query(`
    UPDATE [CRM].[dbo].[PaymentStructure]
    SET status = 'overdue'
    WHERE status NOT IN ('paid', 'overdue', 'cancelled')
      AND CAST(payment_date AS DATE) < CAST(GETDATE() AS DATE)
  `);

  const result = await query(`
    SELECT id FROM [CRM].[dbo].[PaymentStructure]
    WHERE status = 'overdue'
      AND (
        overdue_last_notified IS NULL OR
        CAST(overdue_last_notified AS DATE) < CAST(GETDATE() AS DATE)
      )
  `);

  for (const row of result.recordset) {
    await notifyPaymentOverdue(row.id);
    await query(
      `UPDATE [CRM].[dbo].[PaymentStructure] SET overdue_last_notified = GETDATE() WHERE id = @id`,
      { id: row.id }
    );
  }

  logger.info(`[CRON] Payment overdue alerts sent: ${result.recordset.length}`);
}), { scheduled: false });

// ─── Start / Stop ─────────────────────────────────────────────────────────────

const startAllJobs = () => {
  callbackReminderJob.start();
  appointmentReminderJob.start();
  reminderDueJob.start();
  paymentDueJob.start();
  paymentOverdueJob.start();
  logger.info('✅ All notification cron jobs started');
};

const stopAllJobs = () => {
  callbackReminderJob.stop();
  appointmentReminderJob.stop();
  reminderDueJob.stop();
  paymentDueJob.stop();
  paymentOverdueJob.stop();
  logger.info('🛑 All notification cron jobs stopped');
};

module.exports = { startAllJobs, stopAllJobs };
