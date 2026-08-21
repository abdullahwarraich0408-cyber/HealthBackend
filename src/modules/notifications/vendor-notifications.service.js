const prisma = require('../../config/database');
const { notificationQueue } = require('../../queues');
const inbox = require('./inbox.service');

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

  await inbox.notify({
    recipientType: 'vendor',
    recipientId: vendorId,
    type,
    title,
    message,
    data,
    link: data?.orderId ? '/vendor/orders' : '/vendor/dashboard',
  });

  return notification;
}

async function listVendorNotifications(vendorId) {
  return prisma.vendorNotification.findMany({
    where: { vendor_id: vendorId },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
}

async function markAllVendorNotificationsRead(vendorId) {
  return prisma.vendorNotification.updateMany({
    where: { vendor_id: vendorId, status: 'unread' },
    data: { status: 'read', read_at: new Date() },
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
  markAllVendorNotificationsRead,
};
