/**
 * Firebase Admin SDK initializer — compatible with firebase-admin v12+.
 *
 * v12+ changed from the old namespace API:
 *   admin.credential.cert(...)  → cert(...) (named export from 'firebase-admin/app')
 *   admin.messaging()           → getMessaging() from 'firebase-admin/messaging'
 *
 * Reads credentials from environment variables instead of a JSON file.
 * This is the recommended approach for cloud deployments (Azure, Heroku, etc.)
 * because service account JSON files should never be committed to source control.
 *
 * ── Private Key handling ─────────────────────────────────────────────────────
 * The private key in the service account JSON contains real newlines (\n).
 * When stored in .env files or Azure App Settings as a single-line string,
 * those newlines become literal backslash-n sequences ("\\n").
 * The `.replace(/\\n/g, '\n')` call below converts them back to real newlines.
 * This works identically in:
 *   - Local .env files (dotenv reads "\\n" as the two-char sequence)
 *   - Azure App Service Application Settings (same behavior)
 *   - GitHub Actions / environment secrets
 */

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging }                  = require('firebase-admin/messaging');

let firebaseApp;

function getFirebaseApp() {
  // Return existing app if already initialized (singleton)
  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_CLIENT_ID,
    FIREBASE_CLIENT_CERT_URL,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    throw new Error(
      '[Firebase] Missing required env vars: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL'
    );
  }

  const serviceAccount = {
    type: 'service_account',
    project_id: FIREBASE_PROJECT_ID,
    private_key_id: FIREBASE_PRIVATE_KEY_ID,

    // Azure & .env safe: convert literal "\\n" back to real newlines
    private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),

    client_email: FIREBASE_CLIENT_EMAIL,
    client_id: FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: FIREBASE_CLIENT_CERT_URL,
    universe_domain: 'googleapis.com',
  };

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
  });

  console.log('[Firebase] Admin SDK initialized ✅');
  return firebaseApp;
}

// Initialize on first import
getFirebaseApp();

module.exports = {
  // Lazy getter — safe to call before full app boot
  messaging: () => getMessaging(getFirebaseApp()),
  getApp:    () => getFirebaseApp(),
};
