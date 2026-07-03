const admin = require('firebase-admin');
// const path = require('path');
// require('dotenv').config();

// let firebaseApp = null;

// const initializeFirebase = () => {
//   if (firebaseApp) return firebaseApp;

//   try {
//     const serviceAccountPath =
//       './serviceAccountKey.json' ||
//       path.join(__dirname, 'serviceAccountKey.json');

//     const serviceAccount = require(serviceAccountPath);

//     firebaseApp = admin.initializeApp({
//       credential: admin.credential.cert(serviceAccount),
//     });

//     console.log('✅ Firebase Admin SDK initialized');
//     return firebaseApp;
//   } catch (err) {
//     console.error('❌ Firebase initialization failed:', err.message);
//     throw err;
//   }
// };

// const getFirebaseAdmin = () => {
//   if (!firebaseApp) initializeFirebase();
//   return admin;
// };

// module.exports = { initializeFirebase, getFirebaseAdmin };












const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");

let firebaseApp = null;

const initializeFirebase = () => {
  try {
    if (firebaseApp) {
      return firebaseApp;
    }

    if (getApps().length > 0) {
      firebaseApp = getApps()[0];
      return firebaseApp;
    }

    const serviceAccount = require(path.join(
      __dirname,
      "serviceAccountKey.json"
    ));

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });


    return firebaseApp;
  } catch (error) {
    console.error(
      "❌ Firebase initialization failed:",
      error
    );

    throw error;
  }
};

const getFirebaseAdmin = () => {
  if (!firebaseApp) initializeFirebase();
  return admin;
};

module.exports = {
  initializeFirebase,
  getFirebaseAdmin
};
