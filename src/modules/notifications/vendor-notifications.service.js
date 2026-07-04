const prisma = require('../../config/database');
const { notificationQueue } = require('../../queues');

async function createVendorNotification({
  vendorId,
  type,
  title,
  message,
  data = null,
  channels = ['in_app'],
}) {
  const notification = await prisma.vendorNotification.create({
    data: {
      vendor_id: vendorId,
      type,
      title,
      message,
      data: data || undefined,
      channel: channels[0] || 'in_app',
    },
  });

  for (const channel of channels.filter((value) => value !== 'in_app')) {
    try {
      await notificationQueue.add(type, {
        channel,
        type,
        recipient: data?.recipient || '',
        payload: {
          vendorId,
          title,
          message,
          ...data,
        },
      });
    } catch {
      // Best effort queueing; in-app notification already persisted.
    }
  }

  return notification;
}

async function listVendorNotifications(vendorId) {
  return prisma.vendorNotification.findMany({
    where: { vendor_id: vendorId },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
}

async function markVendorNotificationRead(vendorId, notificationId) {
  return prisma.vendorNotification.updateMany({
    where: {
      id: notificationId,
      vendor_id: vendorId,
    },
    data: {
      status: 'read',
      read_at: new Date(),
    },
  });
}

module.exports = {
  createVendorNotification,
  listVendorNotifications,
  markVendorNotificationRead,
};
