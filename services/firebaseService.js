const { initializeFirebase } = require("../config/firebase");
const { getMessaging } = require("firebase-admin/messaging");
const { query } = require("../config/db");

const {
  logger,
  buildFCMPayload,
  buildFCMMulticastPayload,
  chunkArray,
} = require("../utils/notificationHelper");

initializeFirebase();

// ───────────────────────────────────────────────────────────────
// Send to Single Device
// ───────────────────────────────────────────────────────────────

const sendToDevice = async (token, title, body, data = {}) => {
  console.log(`sendToDevice called | Token: ${token} | Title: ${title} | Body: ${body} | Data: ${JSON.stringify(data)}`);
  try {
    const payload = buildFCMPayload(token, title, body, data);

    console.log(payload);

    const response = await getMessaging().send(payload);

    console.log(`FCM sent | MsgID: ${response}`);

    logger.info(`FCM sent | MsgID: ${response}`);

    return {
      success: true,
      messageId: response,
    };
  } catch (err) {
    logger.error(`FCM sendToDevice failed: ${err.message}`);

    if (
      err.code === "messaging/invalid-registration-token" ||
      err.code === "messaging/registration-token-not-registered"
    ) {
      await deactivateToken(token);
    }

    return {
      success: false,
      error: err.message,
    };
  }
};

// ───────────────────────────────────────────────────────────────
// Send to Multiple Devices
// ───────────────────────────────────────────────────────────────

const sendToMultipleDevices = async (
  tokens,
  title,
  body,
  data = {}
) => {
  if (!tokens || tokens.length === 0) {
    return {
      success: false,
      error: "No tokens provided",
    };
  }

  const batches = chunkArray(tokens, 500);

  const results = {
    successCount: 0,
    failureCount: 0,
    failedTokens: [],
  };

  for (const batch of batches) {
    try {
      const payload = buildFCMMulticastPayload(
        batch,
        title,
        body,
        data
      );

      const response =
        await getMessaging().sendEachForMulticast(payload);

      results.successCount += response.successCount;
      results.failureCount += response.failureCount;

      const invalidTokens = [];

      response.responses.forEach((res, index) => {
        if (!res.success) {
          results.failedTokens.push({
            token: batch[index],
            error: res.error?.message,
          });

          if (
            res.error?.code ===
              "messaging/invalid-registration-token" ||
            res.error?.code ===
              "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(batch[index]);
          }
        }
      });

      for (const token of invalidTokens) {
        await deactivateToken(token);
      }
    } catch (err) {
      logger.error(
        `FCM multicast batch failed: ${err.message}`
      );

      results.failureCount += batch.length;
    }
  }

  logger.info(
    `FCM multicast | Success: ${results.successCount} | Failed: ${results.failureCount}`
  );

  return {
    success: true,
    results,
  };
};

// ───────────────────────────────────────────────────────────────
// Topic Notification
// ───────────────────────────────────────────────────────────────

const sendToTopic = async (
  topic,
  title,
  body,
  data = {}
) => {
  try {
    const response = await getMessaging().send({
      topic,
      notification: {
        title,
        body,
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    });

    logger.info(
      `FCM topic [${topic}] sent | MsgID: ${response}`
    );

    return {
      success: true,
      messageId: response,
    };
  } catch (err) {
    logger.error(
      `FCM sendToTopic failed: ${err.message}`
    );

    return {
      success: false,
      error: err.message,
    };
  }
};

// ───────────────────────────────────────────────────────────────
// Token Helpers
// ───────────────────────────────────────────────────────────────

const getTokenForUser = async (userId) => {
  const result = await query(
    `SELECT fcm_token
     FROM [CRM].[dbo].[Users]
     WHERE id=@userId
       AND fcm_token IS NOT NULL`,
    { userId }
  );

  return result.recordset[0]?.fcm_token || null;
};

const getTokensForRole = async (role) => {
  const result = await query(
    `SELECT fcm_token
     FROM [CRM].[dbo].[Users]
     WHERE role=@role
       AND fcm_token IS NOT NULL`,
    { role }
  );

  return result.recordset.map((r) => r.fcm_token);
};

const saveDeviceToken = async (
  userId,
  fcmToken
) => {
  await query(
    `UPDATE [CRM].[dbo].[Users]
     SET fcm_token=@fcmToken
     WHERE id=@userId`,
    {
      userId,
      fcmToken,
    }
  );
};

const deactivateToken = async (token) => {
  await query(
    `UPDATE [CRM].[dbo].[Users]
     SET fcm_token=NULL
     WHERE fcm_token=@token`,
    { token }
  );

  logger.warn("Invalid FCM token removed.");
};

// ───────────────────────────────────────────────────────────────
// Generic Push Notification
// ───────────────────────────────────────────────────────────────

const sendPushNotification = async ({
  token,
  title,
  body,
  data = {},
}) => {
  try {
    const response = await getMessaging().send({
      token,
      notification: {
        title,
        body,
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    });

    logger.info(`Notification sent: ${response}`);

    return {
      success: true,
      response,
    };
  } catch (error) {
    logger.error(error);

    return {
      success: false,
      error: error.message,
    };
  }
};

// ───────────────────────────────────────────────────────────────
// Notification Log
// ───────────────────────────────────────────────────────────────

const logNotification = async ({
  userId = null,
  type,
  title,
  body,
  referenceId = null,
  referenceType = null,
  status = "sent",
}) => {
  try {
    await query(
      `INSERT INTO [CRM].[dbo].[NotificationLogs]
      (
        user_id,
        type,
        title,
        body,
        reference_id,
        reference_type,
        status,
        created_at
      )
      VALUES
      (
        @userId,
        @type,
        @title,
        @body,
        @referenceId,
        @referenceType,
        @status,
        GETDATE()
      )`,
      {
        userId,
        type,
        title,
        body,
        referenceId,
        referenceType,
        status,
      }
    );
  } catch (err) {
    logger.error(
      `logNotification failed: ${err.message}`
    );
  }
};

module.exports = {
  sendToDevice,
  sendToMultipleDevices,
  sendToTopic,
  sendPushNotification,
  getTokenForUser,
  getTokensForRole,
  saveDeviceToken,
  logNotification,
};