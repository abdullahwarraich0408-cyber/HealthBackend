const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

router.use(protect);

router.get('/vendor', restrictTo('vendor'), controller.getVendorNotifications);
router.patch('/vendor/:id/read', restrictTo('vendor'), controller.markVendorNotificationRead);
router.post('/test', restrictTo('vendor'), controller.testVendorNotification);

module.exports = router;
