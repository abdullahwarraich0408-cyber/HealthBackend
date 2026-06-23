const catchAsync = require('../../utils/catchAsync');
const couponsService = require('./coupons.service');
const { sendResponse } = require('../../utils/response');

const createCoupon = catchAsync(async (req, res) => {
  const coupon = await couponsService.createCoupon(req.body);
  sendResponse(res, 201, { coupon }, 'Coupon created successfully');
});

const validateCoupon = catchAsync(async (req, res) => {
  const { code } = req.params;
  const orderAmount = req.query.orderAmount || 0;
  
  const coupon = await couponsService.validateCoupon(code, orderAmount);
  sendResponse(res, 200, { coupon }, 'Coupon is valid');
});

const listApplicableCoupons = catchAsync(async (req, res) => {
  const coupons = await couponsService.getApplicableCoupons();
  sendResponse(res, 200, { coupons }, 'Applicable coupons listed successfully');
});

module.exports = {
  createCoupon,
  validateCoupon,
  listApplicableCoupons
};
