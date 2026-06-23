const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const createCoupon = async (couponData) => {
  const {
    code,
    discount_type,
    discount_value,
    min_order_amount,
    max_discount_amount,
    start_date,
    expiry_date,
    usage_limit
  } = couponData;

  const normalizedCode = code.trim().toUpperCase();

  // Check if code already exists
  const existing = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
  if (existing) throw new AppError('Coupon code already exists', 400);

  // Validate dates
  const start = new Date(start_date);
  const expiry = new Date(expiry_date);
  if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
    throw new AppError('Invalid start_date or expiry_date', 400);
  }
  if (expiry <= start) {
    throw new AppError('expiry_date must be after start_date', 400);
  }

  return prisma.coupon.create({
    data: {
      code: normalizedCode,
      discount_type,
      discount_value,
      min_order_amount: min_order_amount || 0.0,
      max_discount_amount,
      start_date: start,
      expiry_date: expiry,
      usage_limit
    }
  });
};

const validateCoupon = async (code, orderAmount = 0) => {
  const normalizedCode = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });

  if (!coupon) throw new AppError('Coupon not found', 404);
  if (!coupon.is_active) throw new AppError('Coupon is inactive', 400);

  const now = new Date();
  if (now < new Date(coupon.start_date)) {
    throw new AppError('Coupon is not active yet', 400);
  }
  if (now > new Date(coupon.expiry_date)) {
    throw new AppError('Coupon has expired', 400);
  }

  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new AppError('Coupon usage limit reached', 400);
  }

  if (orderAmount < coupon.min_order_amount) {
    throw new AppError(`Minimum order amount of Rs. ${coupon.min_order_amount} is required`, 400);
  }

  return coupon;
};

const getApplicableCoupons = async () => {
  const now = new Date();
  // Find all active coupons whose dates are currently valid
  const coupons = await prisma.coupon.findMany({
    where: {
      is_active: true,
      start_date: { lte: now },
      expiry_date: { gte: now }
    }
  });

  // Filter coupons that haven't hit their usage limit
  return coupons.filter(coupon => {
    if (coupon.usage_limit === null) return true;
    return coupon.used_count < coupon.usage_limit;
  });
};

module.exports = {
  createCoupon,
  validateCoupon,
  getApplicableCoupons
};
