const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { checkOfferEligibility, evaluateBestOffers } = require('./offers.engine');

/**
 * Gets active public offers with optional category/search filters.
 */
const getPublicOffers = async (query = {}) => {
  const { category, search, city } = query;
  const now = new Date();

  const where = {
    status: 'ACTIVE',
    is_active: true,
    start_at: { lte: now },
    end_at: { gte: now },
  };

  if (category && category !== 'all') {
    if (category === 'medicines') {
      where.type = { in: ['PRODUCT_DISCOUNT', 'CATEGORY_DISCOUNT', 'PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT'] };
    } else if (category === 'labs') {
      where.type = { in: ['LAB_OFFER', 'HEALTH_PACKAGE', 'PROVIDER_DISCOUNT', 'PERCENTAGE_DISCOUNT'] };
    } else if (category === 'consultations') {
      where.type = { in: ['CONSULTATION_OFFER', 'DOCTOR_DISCOUNT', 'PROVIDER_DISCOUNT'] };
    } else if (category === 'bank-wallet') {
      where.type = { in: ['BANK_OFFER', 'WALLET_OFFER'] };
    } else if (category === 'free-delivery') {
      where.type = 'FREE_DELIVERY';
    }
  }

  if (search && search.trim() !== '') {
    where.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { short_description: { contains: search.trim(), mode: 'insensitive' } },
      { promo_code: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  const offers = await prisma.offer.findMany({
    where,
    orderBy: [{ created_at: 'desc' }],
    include: {
      product: {
        select: { id: true, name: true, price: true, image_url: true, category: true },
      },
      vendor: {
        select: { id: true, business_name: true, city: true },
      },
    },
  });

  return offers;
};

/**
 * Gets single offer by ID.
 */
const getOfferById = async (id) => {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, price: true, image_url: true } },
      vendor: { select: { id: true, business_name: true, city: true } },
    },
  });

  if (!offer) throw new AppError('Offer not found', 404);
  return offer;
};

/**
 * Evaluates cart context against all active offers.
 */
const evaluateCheckoutOffers = async (params) => {
  return await evaluateBestOffers(params);
};

/**
 * Validates a promo code.
 */
const validatePromoCode = async ({ promoCode, userId, subtotal, deliveryFee = 0, city, items }) => {
  if (!promoCode || !promoCode.trim()) {
    throw new AppError('Please enter a promo code', 400);
  }

  const now = new Date();
  const offer = await prisma.offer.findFirst({
    where: {
      promo_code: { equals: promoCode.trim(), mode: 'insensitive' },
      status: 'ACTIVE',
      is_active: true,
      start_at: { lte: now },
      end_at: { gte: now },
    },
  });

  if (!offer) {
    throw new AppError('This promo code is invalid or has expired', 404);
  }

  const eligibility = await checkOfferEligibility({
    offer,
    userId,
    subtotal,
    deliveryFee,
    city,
    items,
    promoCodeInput: promoCode,
  });

  if (!eligibility.eligible) {
    throw new AppError(eligibility.reason || 'This promo code cannot be applied', 400);
  }

  return {
    valid: true,
    offerId: offer.id,
    promoCode: offer.promo_code,
    title: offer.title,
    discountAmount: eligibility.discountAmount,
    isFreeDelivery: eligibility.isFreeDelivery,
    finalTotal: eligibility.finalSubtotal,
  };
};

/**
 * Subscribes user to offer notification preferences.
 */
const updateAlertPreferences = async (userId, preferences) => {
  if (!userId) {
    throw new AppError('Authentication required to manage notification preferences', 401);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      notification_preferences: preferences,
    },
    select: { id: true, email: true, notification_preferences: true },
  });

  return updatedUser;
};

/**
 * Admin: Create Offer
 */
const createOffer = async (adminId, data) => {
  const {
    title,
    short_description,
    description,
    type,
    discount_type,
    percentage_value,
    fixed_amount,
    promo_code,
    start_at,
    end_at,
    minimum_order_amount,
    maximum_discount_amount,
    total_usage_limit,
    usage_per_user,
    new_users_only,
    automatic_apply,
    stackable,
    funding_source,
    city_ids,
    vendor_ids,
    lab_ids,
    doctor_ids,
    product_ids,
    category_ids,
    payment_method_ids,
    banner_image,
    thumbnail_image,
    partner_logo,
    terms_and_conditions,
    vendor_id,
    product_id,
  } = data;

  if (!title || !end_at) {
    throw new AppError('Offer title and expiration date are required', 400);
  }

  const startDate = start_at ? new Date(start_at) : new Date();
  const endDate = new Date(end_at);

  if (endDate <= startDate) {
    throw new AppError('Expiration date must be after start date', 400);
  }

  return await prisma.offer.create({
    data: {
      title,
      short_description: short_description || '',
      description: description || '',
      type: type || 'PERCENTAGE_DISCOUNT',
      discount_type: discount_type || 'PERCENTAGE',
      percentage_value: percentage_value ? parseFloat(percentage_value) : null,
      fixed_amount: fixed_amount ? parseFloat(fixed_amount) : null,
      promo_code: promo_code ? promo_code.trim().toUpperCase() : null,
      start_at: startDate,
      end_at: endDate,
      expiry_date: endDate,
      status: data.status || 'ACTIVE',
      minimum_order_amount: minimum_order_amount ? parseFloat(minimum_order_amount) : 0,
      maximum_discount_amount: maximum_discount_amount ? parseFloat(maximum_discount_amount) : null,
      total_usage_limit: total_usage_limit ? parseInt(total_usage_limit, 10) : null,
      usage_per_user: usage_per_user ? parseInt(usage_per_user, 10) : 1,
      new_users_only: Boolean(new_users_only),
      automatic_apply: automatic_apply !== undefined ? Boolean(automatic_apply) : true,
      stackable: Boolean(stackable),
      funding_source: funding_source || 'MEDZOOS',
      city_ids: city_ids || null,
      vendor_ids: vendor_ids || null,
      lab_ids: lab_ids || null,
      doctor_ids: doctor_ids || null,
      product_ids: product_ids || null,
      category_ids: category_ids || null,
      payment_method_ids: payment_method_ids || null,
      banner_image,
      thumbnail_image,
      partner_logo,
      terms_and_conditions,
      vendor_id: vendor_id || null,
      product_id: product_id || null,
    },
  });
};

/**
 * Admin: Get All Offers with Stats
 */
const getAdminOffers = async (query = {}) => {
  const { status, type, search } = query;
  const where = {};

  if (status) where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { promo_code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const offers = await prisma.offer.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      _count: {
        select: { redemptions: true },
      },
    },
  });

  return offers;
};

/**
 * Admin: Toggle Offer Status
 */
const updateOfferStatus = async (id, status) => {
  const validStatuses = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  return await prisma.offer.update({
    where: { id },
    data: {
      status,
      is_active: status === 'ACTIVE',
    },
  });
};

/**
 * Admin: Delete Offer
 */
const deleteOffer = async (id) => {
  return await prisma.offer.delete({
    where: { id },
  });
};

/**
 * Admin: Get Offer Redemptions Analytics
 */
const getOfferRedemptions = async (id) => {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      redemptions: {
        orderBy: { redeemed_at: 'desc' },
        take: 100,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });

  if (!offer) throw new AppError('Offer not found', 404);

  const totalDiscountSpent = offer.redemptions.reduce((acc, r) => acc + r.discount_amount, 0);

  return {
    offer,
    totalRedemptions: offer.redemptions.length,
    totalDiscountSpent,
  };
};

module.exports = {
  getPublicOffers,
  getOfferById,
  evaluateCheckoutOffers,
  validatePromoCode,
  updateAlertPreferences,
  createOffer,
  getAdminOffers,
  updateOfferStatus,
  deleteOffer,
  getOfferRedemptions,
};
