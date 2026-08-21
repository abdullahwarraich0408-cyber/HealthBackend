const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const validator = require('./notifications.validator');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const { validate } = require('../../middleware/validate.middleware');

router.use(protect);

router.get('/', controller.listInbox);
router.patch('/:id/read', controller.markInboxRead);
router.post('/read-all', controller.markInboxAllRead);

router.post(
  '/device-token',
  restrictTo('customer', 'admin', 'vendor', 'doctor', 'lab'),
  validate(validator.registerDeviceTokenSchema),
  controller.registerDeviceToken,
);
router.post(
  '/test-push',
  restrictTo('customer', 'admin', 'vendor', 'doctor', 'lab'),
  controller.testCustomerPush,
);

router.get('/vendor', restrictTo('vendor'), controller.getVendorNotifications);
router.patch('/vendor/:id/read', restrictTo('vendor'), controller.markVendorNotificationRead);
router.post('/vendor/read-all', restrictTo('vendor'), controller.markAllVendorNotificationsRead);
router.post('/test', restrictTo('vendor'), controller.testVendorNotification);

module.exports = router;
