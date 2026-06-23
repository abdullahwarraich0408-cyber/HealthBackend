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
router.get('/:id/reviews', reviewsController.getVendorReviews);

// Protected routes (Vendor only)
router.use(protect);
router.use(restrictTo('vendor'));
router.get('/profile', vendorsController.getProfile);
router.patch('/profile', validate(vendorsValidator.updateVendorSchema), vendorsController.updateProfile);
router.get('/products/mine', vendorsController.getMyProducts);
router.get('/dashboard/stats', vendorsController.getDashboardStats);

module.exports = router;
