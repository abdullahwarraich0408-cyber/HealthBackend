const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { logger } = require('../../utils/logger');
const { sendPushToTokens } = require('../../notifications/push/push.service');

const STATUS_LABELS = {
  pending: 'pending',
  processing: 'being processed',
  shipped: 'on the way',
  delivered: 'delivered',
  cancelled: 'cancelled',
  packed: 'packed',
  rider_assigned: 'assigned to a rider',
  out_for_delivery: 'out for delivery',
  confirmed: 'confirmed',
  accepted: 'accepted by the pharmacy',
};

async function registerDeviceToken(userId, { fcmToken, deviceId, platform }) {
  if (!fcmToken || !deviceId) {
    throw new AppError('FCM token and device ID are required', 400);
  }

  const session = await prisma.userSession.findFirst({
    where: {
      user_id: userId,
      device_id: deviceId,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: 'desc' },
  });

  if (session) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        fcm_token: fcmToken,
        platform: platform || session.platform,
      },
    });
    return { registered: true, sessionId: session.id };
  }

  await prisma.userSession.updateMany({
    where: {
      user_id: userId,
      device_id: deviceId,
    },
    data: {
      fcm_token: fcmToken,
      platform: platform || 'android',
    },
  });

  return { registered: true };
}

async function getUserFcmTokens(userId) {
  const sessions = await prisma.userSession.findMany({
    where: {
      user_id: userId,
      fcm_token: { not: null },
      expires_at: { gt: new Date() },
    },
    select: { fcm_token: true },
  });

  return sessions.map((session) => session.fcm_token).filter(Boolean);
}

async function sendPushToUser(userId, payload) {
  const tokens = await getUserFcmTokens(userId);
  if (!tokens.length) {
    return { delivered: false, reason: 'no_tokens' };
  }

  const result = await sendPushToTokens(tokens, payload);
  return {
    delivered: result.successCount > 0,
    ...result,
  };
}

async function sendTestPush(userId) {
  return sendPushToUser(userId, {
    title: 'MedCare notifications are working',
    body: 'You will receive order updates and appointment reminders here.',
    type: 'test',
    data: {
      id: `test-${Date.now()}`,
    },
  });
}

async function notifyOrderStatusChange(
  userId,
  { orderId, status, orderType = 'medicine' },
) {
  const label = STATUS_LABELS[status] || status.replace(/_/g, ' ');
  const shortId = orderId.slice(0, 8);

  try {
    const result = await sendPushToUser(userId, {
      title: 'Order update',
      body: `Your order #${shortId} is now ${label}.`,
      type: 'order_status_updated',
      data: { orderId, status, type: orderType },
    });

    if (!result.delivered) {
      logger.warn('[push] Order status notification not delivered', {
        userId,
        orderId,
        status,
        reason: result.reason || 'unknown',
      });
    }

    return result;
  } catch (error) {
    logger.error('[push] Failed to send order status notification', {
      userId,
      orderId,
      status,
      error: error.message,
    });
    return { delivered: false, reason: 'error' };
  }
}

module.exports = {
  registerDeviceToken,
  getUserFcmTokens,
  sendPushToUser,
  sendTestPush,
  notifyOrderStatusChange,
};
