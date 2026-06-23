const express = require('express');
const router = express.Router();
const couponsController = require('./coupons.controller');
const couponsValidator = require('./coupons.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// POST /api/coupons – admin create coupon
router.post('/', protect, restrictTo('admin'), validate(couponsValidator.createCouponSchema), couponsController.createCoupon);

// GET /api/coupons/:code – validate coupon
router.get('/:code', protect, restrictTo('customer'), validate(couponsValidator.validateCouponSchema), couponsController.validateCoupon);

module.exports = router;
