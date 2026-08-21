const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const vendorNotificationsService = require('./vendor-notifications.service');
const customerNotificationsService = require('./customer-notifications.service');
const inbox = require('./inbox.service');

const getVendorNotifications = catchAsync(async (req, res) => {
  const notifications = await vendorNotificationsService.listVendorNotifications(req.user.id);
  sendResponse(res, 200, { notifications }, 'Notifications fetched successfully');
});

const markVendorNotificationRead = catchAsync(async (req, res) => {
  await vendorNotificationsService.markVendorNotificationRead(req.user.id, req.params.id);
  sendResponse(res, 200, null, 'Notification marked as read');
});

const markAllVendorNotificationsRead = catchAsync(async (req, res) => {
  await vendorNotificationsService.markAllVendorNotificationsRead(req.user.id);
  sendResponse(res, 200, null, 'All notifications marked as read');
});

const testVendorNotification = catchAsync(async (req, res) => {
  const notification = await vendorNotificationsService.createVendorNotification({
    vendorId: req.user.id,
    type: 'test',
    title: 'Test notification',
    message: 'This is a test vendor notification.',
    data: { initiatedBy: req.user.id },
  });

  sendResponse(res, 201, { notification }, 'Notification created');
});

const registerDeviceToken = catchAsync(async (req, res) => {
  const result = await customerNotificationsService.registerDeviceToken(req.user.id, req.body);
  sendResponse(res, 200, result, 'Device token registered');
});

const testCustomerPush = catchAsync(async (req, res) => {
  const result = await customerNotificationsService.sendTestPush(req.user.id);
  sendResponse(res, 200, result, 'Test push sent');
});

const listInbox = catchAsync(async (req, res) => {
  const [notifications, unread] = await Promise.all([
    inbox.listInbox(req.user.role, req.user.id),
    inbox.unreadCount(req.user.role, req.user.id),
  ]);
  sendResponse(res, 200, { notifications, unreadCount: unread }, 'Notifications fetched successfully');
});

const markInboxRead = catchAsync(async (req, res) => {
  await inbox.markRead(req.user.role, req.user.id, req.params.id);
  sendResponse(res, 200, null, 'Notification marked as read');
});

const markInboxAllRead = catchAsync(async (req, res) => {
  await inbox.markAllRead(req.user.role, req.user.id);
  sendResponse(res, 200, null, 'All notifications marked as read');
});

module.exports = {
  getVendorNotifications,
  markVendorNotificationRead,
  markAllVendorNotificationsRead,
  testVendorNotification,
  registerDeviceToken,
  testCustomerPush,
  listInbox,
  markInboxRead,
  markInboxAllRead,
};
