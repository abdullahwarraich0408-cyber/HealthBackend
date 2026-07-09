const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const validator = require('./notifications.validator');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const { validate } = require('../../middleware/validate.middleware');

router.use(protect);

router.post(
  '/device-token',
  restrictTo('customer', 'admin'),
  validate(validator.registerDeviceTokenSchema),
  controller.registerDeviceToken,
);
router.post('/test-push', restrictTo('customer', 'admin'), controller.testCustomerPush);

router.get('/vendor', restrictTo('vendor'), controller.getVendorNotifications);
router.patch('/vendor/:id/read', restrictTo('vendor'), controller.markVendorNotificationRead);
router.post('/test', restrictTo('vendor'), controller.testVendorNotification);

module.exports = router;
