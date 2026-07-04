const express = require('express');
const router = express.Router();
const vendorsController = require('./vendors.controller');
const vendorsValidator = require('./vendors.validator');
const reviewsController = require('../reviews/reviews.controller');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// Public routes
router.get('/', vendorsController.getAllVendors);
router.post('/register', validate(vendorsValidator.vendorRegisterSchema), vendorsController.register);
router.get('/onboarding-status/:id', vendorsController.getOnboardingStatus);
router.get('/:id/reviews', reviewsController.getVendorReviews);

// Protected routes (Vendor only)
router.use(protect);
router.use(restrictTo('vendor'));
router.get('/profile/availability', vendorsController.getAvailability);
router.patch('/profile/availability', validate(vendorsValidator.availabilitySchema), vendorsController.updateAvailability);
router.get('/profile', vendorsController.getProfile);
router.patch('/profile', validate(vendorsValidator.updateVendorSchema), vendorsController.updateProfile);
router.get('/operating-hours', vendorsController.getOperatingHours);
router.put('/operating-hours', validate(vendorsValidator.operatingHoursSchema), vendorsController.updateOperatingHours);
router.get('/service-areas', vendorsController.getServiceAreas);
router.put('/service-areas', validate(vendorsValidator.serviceAreasSchema), vendorsController.updateServiceAreas);
router.get('/earnings/summary', vendorsController.getEarningsSummary);
router.get('/settlements', vendorsController.getSettlements);
router.get('/analytics/overview', vendorsController.getAnalyticsOverview);
router.get('/analytics/performance', vendorsController.getPerformanceMetrics);
router.get('/audit-logs', vendorsController.getAuditLogs);
router.get('/products/mine', vendorsController.getMyProducts);
router.get('/dashboard/stats', vendorsController.getDashboardStats);

module.exports = router;
