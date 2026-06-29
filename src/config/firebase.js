const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const env = require('./env');

let firebaseApp = null;

function parseServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function initFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  const existing = getApps();
  if (existing.length > 0) {
    firebaseApp = existing[0];
    return firebaseApp;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    console.warn('[firebase] Admin SDK not configured — Firebase auth endpoints disabled');
    return null;
  }

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
  });

  return firebaseApp;
}

function getFirebaseAuth() {
  const app = initFirebaseAdmin();
  if (!app) return null;
  return getAuth(app);
}

async function verifyFirebaseIdToken(idToken) {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Admin SDK is not configured');
  }
  return auth.verifyIdToken(idToken, true);
}

module.exports = {
  initFirebaseAdmin,
  getFirebaseAuth,
  verifyFirebaseIdToken,
};
