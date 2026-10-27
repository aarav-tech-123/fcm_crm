const { sendPushNotification } = require(
  "./services/firebaseService"
);

(async () => {
  const result =
    await sendPushNotification({
      token:
        "YOUR_FCM_TOKEN_HERE",

      title: "CRM Test",

      body: "Firebase is working!",

      data: {
        type: "test",
      },
    });

  console.log(result);
})();