-- ============================================================
-- CRM Notification Service — Additive Schema
-- Run ONLY the ALTER TABLE statements below against your
-- existing [CRM] database. The NotificationLogs table is new.
-- ============================================================

-- ─── 1. NotificationLogs — new table for audit trail ──────────────────────────
CREATE TABLE [CRM].[dbo].[NotificationLogs] (
    id              INT PRIMARY KEY IDENTITY(1,1),
    user_id         INT             NULL,    -- FK to Users.id (agent)
    type            NVARCHAR(60)    NOT NULL, -- e.g. 'callback_scheduled'
    title           NVARCHAR(200)   NOT NULL,
    body            NVARCHAR(1000)  NOT NULL,
    reference_id    INT             NULL,    -- FK to source row (callback id, appt id…)
    reference_type  NVARCHAR(60)    NULL,    -- 'ContactCallbacks', 'ContactAppointments'…
    status          NVARCHAR(20)    NOT NULL DEFAULT 'sent',
    created_at      DATETIME        NOT NULL DEFAULT GETDATE(),

    CONSTRAINT FK_NL_Users FOREIGN KEY (user_id) REFERENCES [CRM].[dbo].[Users](id)
);

CREATE INDEX IX_NotificationLogs_UserId ON [CRM].[dbo].[NotificationLogs](user_id, created_at DESC);
CREATE INDEX IX_NotificationLogs_Type   ON [CRM].[dbo].[NotificationLogs](type);

-- ─── 2. ContactCallbacks — cron tracking column ────────────────────────────────
ALTER TABLE [CRM].[dbo].[ContactCallbacks]
    ADD reminder_sent BIT NOT NULL DEFAULT 0;

-- ─── 3. ContactAppointments — cron tracking column ────────────────────────────
ALTER TABLE [CRM].[dbo].[ContactAppointments]
    ADD reminder_sent BIT NOT NULL DEFAULT 0;

-- ─── 4. ContactReminders — cron tracking column ───────────────────────────────
ALTER TABLE [CRM].[dbo].[ContactReminders]
    ADD reminder_sent BIT NOT NULL DEFAULT 0;

-- ─── 5. PaymentStructure — cron tracking columns ──────────────────────────────
ALTER TABLE [CRM].[dbo].[PaymentStructure]
    ADD due_reminder_sent      BIT      NOT NULL DEFAULT 0,
        overdue_last_notified  DATETIME     NULL;

-- ─── 6. Useful indexes for cron queries ───────────────────────────────────────
CREATE INDEX IX_Callbacks_Date_Status
    ON [CRM].[dbo].[ContactCallbacks](callback_date, status, reminder_sent);

CREATE INDEX IX_Appointments_Date_Status
    ON [CRM].[dbo].[ContactAppointments](appointment_date, status, reminder_sent);

CREATE INDEX IX_Reminders_Date_Status
    ON [CRM].[dbo].[ContactReminders](reminder_date, status, reminder_sent);

CREATE INDEX IX_PaymentStructure_Date_Status
    ON [CRM].[dbo].[PaymentStructure](payment_date, status, due_reminder_sent);
