import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
// Load service account from environment variable
const getServiceAccount = () => {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. " +
        "Please add your Firebase service account JSON to the .env file.",
    );
  }

  try {
    return JSON.parse(serviceAccountJson);
  } catch (error) {
    throw new Error(
      "Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. " +
        "Please ensure it contains valid JSON.",
    );
  }
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      getServiceAccount() as admin.ServiceAccount,
    ),
  });
}

export const firebaseAdmin = admin;
export const auth = admin.auth();
