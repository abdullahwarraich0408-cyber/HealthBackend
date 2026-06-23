const express = require('express');
const router = express.Router();
const labPortalController = require('./lab-portal.controller');
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const upload = require('../../middleware/upload.middleware');
const labTestsValidator = require('../lab-tests/labTests.validator');

router.use(protect, restrictTo('lab'));

router.get('/profile', labPortalController.getProfile);
router.patch('/profile', labPortalController.updateProfile);
router.patch('/password', labPortalController.updatePassword);
router.get('/bookings', labPortalController.getBookings);
router.patch('/bookings/:id/status', labPortalController.updateBookingStatus);
router.patch('/bookings/:id/report', validate(labTestsValidator.uploadReportSchema), labPortalController.uploadReport);
router.post('/bookings/:id/report-file', upload.single('report'), labPortalController.uploadReportFile);
router.patch('/bookings/:id/collector', labPortalController.assignCollector);
router.get('/tests', labPortalController.getTests);
router.post('/tests', labPortalController.createTest);
router.patch('/tests/:id', labPortalController.updateTest);
router.delete('/tests/:id', labPortalController.deleteTest);
router.get('/reports/summary', labPortalController.getReportsSummary);

module.exports = router;
