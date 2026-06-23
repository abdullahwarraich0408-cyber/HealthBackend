const express = require('express');
const router = express.Router();
const ctrl = require('./labTests.controller');
const v = require('./labTests.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect, restrictTo } = require('../../middleware/auth.middleware');

router.get('/categories', ctrl.getCategories);
router.get('/time-slots', ctrl.getTimeSlots);
router.get('/labs', ctrl.getLabs);
router.get('/labs/:id', ctrl.getLab);
router.get('/popular', ctrl.getPopularLabTests);

router.get(
  '/bookings/me',
  protect,
  restrictTo('customer'),
  ctrl.getMyBookings
);

router.get(
  '/reports/me',
  protect,
  restrictTo('customer'),
  ctrl.getMyReports
);

router.post(
  '/bookings',
  protect,
  restrictTo('customer'),
  validate(v.bookLabTestSchema),
  ctrl.bookLabTest
);

router.post(
  '/orders',
  protect,
  restrictTo('customer'),
  validate(v.createLabOrderSchema),
  ctrl.createLabOrder
);

router.delete(
  '/bookings/:id',
  protect,
  restrictTo('customer'),
  ctrl.cancelBooking
);

router.get(
  '/lab/bookings',
  protect,
  restrictTo('lab'),
  ctrl.getLabBookings
);

router.patch(
  '/lab/bookings/:id/status',
  protect,
  restrictTo('lab'),
  validate(v.updateBookingStatusSchema),
  ctrl.updateBookingStatus
);

router.patch(
  '/lab/bookings/:id/report',
  protect,
  restrictTo('lab'),
  validate(v.uploadReportSchema),
  ctrl.uploadReport
);

router.patch(
  '/lab/bookings/:id/collector',
  protect,
  restrictTo('lab'),
  validate(v.assignCollectorSchema),
  ctrl.assignCollector
);

router.get(
  '/admin/bookings',
  protect,
  restrictTo('admin'),
  ctrl.getAllBookings
);

router.get('/', ctrl.getLabTests);
router.get('/:id', ctrl.getLabTest);

module.exports = router;
