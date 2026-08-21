const { getMessaging } = require('firebase-admin/messaging');
const { initFirebaseAdmin } = require('../../config/firebase');
const { logger } = require('../../utils/logger');

function getFirebaseMessaging() {
  const app = initFirebaseAdmin();
  if (!app) return null;
  return getMessaging(app);
}

async function sendPushToTokens(tokens, payload) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    logger.warn('[push] Firebase Admin not configured — skipping push delivery');
    return { successCount: 0, failureCount: tokens.length, skipped: true };
  }

  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (!uniqueTokens.length) {
    return { successCount: 0, failureCount: 0, skipped: true };
  }

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: Object.fromEntries(
      Object.entries({
        ...(payload.data || {}),
        title: payload.title,
        body: payload.body,
        type: payload.type || 'general',
      }).map(([key, value]) => [key, String(value ?? '')]),
    ),
    android: {
      priority: 'high',
      notification: {
        channelId: 'medcare_default',
        sound: 'default',
      },
    },
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title: payload.title,
        body: payload.body,
        icon: '/favicon-32.png',
      },
      fcmOptions: {
        link: String(payload.data?.link || '/'),
      },
    },
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    skipped: false,
  };
}

module.exports = {
  sendPushToTokens,
};
