const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const vendorNotificationsService = require('./vendor-notifications.service');

const getVendorNotifications = catchAsync(async (req, res) => {
  const notifications = await vendorNotificationsService.listVendorNotifications(req.user.id);
  sendResponse(res, 200, { notifications }, 'Notifications fetched successfully');
});

const markVendorNotificationRead = catchAsync(async (req, res) => {
  await vendorNotificationsService.markVendorNotificationRead(req.user.id, req.params.id);
  sendResponse(res, 200, null, 'Notification marked as read');
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

module.exports = {
  getVendorNotifications,
  markVendorNotificationRead,
  testVendorNotification,
};
