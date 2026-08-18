const prisma = require('../../config/database');

/**
 * Checks single offer eligibility against context.
 * Returns { eligible: boolean, reason?: string, discountAmount: number, isFreeDelivery: boolean }
 */
async function checkOfferEligibility({
  offer,
  userId = null,
  serviceType = 'medicine', // 'medicine' | 'lab' | 'doctor'
  items = [],
  subtotal = 0,
  deliveryFee = 0,
  city = null,
  paymentMethod = null,
  promoCodeInput = null,
}) {
  const now = new Date();

  // 1. Status Check
  if (offer.status !== 'ACTIVE' || offer.is_active === false) {
    return { eligible: false, reason: 'This offer is not active' };
  }

  // 2. Schedule Check
  if (offer.start_at && new Date(offer.start_at) > now) {
    return { eligible: false, reason: 'This offer has not started yet' };
  }
  if (offer.end_at && new Date(offer.end_at) < now) {
    return { eligible: false, reason: 'This offer has expired' };
  }
  if (offer.expiry_date && new Date(offer.expiry_date) < now) {
    return { eligible: false, reason: 'This offer has expired' };
  }

  // 3. Usage Limit Check
  if (offer.total_usage_limit && offer.used_count >= offer.total_usage_limit) {
    return { eligible: false, reason: 'This offer usage limit has been reached' };
  }

  // 4. Promo Code Check (if offer requires a promo code)
  if (offer.type === 'PROMO_CODE' || offer.promo_code) {
    if (!promoCodeInput) {
      return { eligible: false, reason: 'Promo code required to use this offer' };
    }
    if (offer.promo_code.trim().toUpperCase() !== promoCodeInput.trim().toUpperCase()) {
      return { eligible: false, reason: 'Invalid promo code' };
    }
  }

  // 5. Minimum Order Requirement
  const minSpend = offer.minimum_order_amount || 0;
  if (subtotal < minSpend) {
    return {
      eligible: false,
      reason: `Minimum order requirement is PKR ${minSpend.toLocaleString()}`,
    };
  }

  // 6. City Scope Check
  if (offer.city_ids && Array.isArray(offer.city_ids) && offer.city_ids.length > 0) {
    if (!city || !offer.city_ids.some((c) => String(c).toLowerCase() === String(city).toLowerCase())) {
      return { eligible: false, reason: `Offer is only valid in selected cities` };
    }
  }

  // 7. Payment Method Requirement (Bank/Wallet)
  if (offer.payment_method_ids && Array.isArray(offer.payment_method_ids) && offer.payment_method_ids.length > 0) {
    if (!paymentMethod) {
      return {
        eligible: false,
        reason: 'Select eligible payment method at checkout to unlock this offer',
        requiresPaymentSelection: true,
      };
    }
    const matchedMethod = offer.payment_method_ids.some(
      (pm) => String(pm).toLowerCase() === String(paymentMethod).toLowerCase()
    );
    if (!matchedMethod) {
      return {
        eligible: false,
        reason: 'Payment method is not eligible for this bank/wallet promotion',
      };
    }
  }

  // 8. User-Specific Restrictions (New User / Redemptions Count)
  if (userId) {
    // Per-User Limit
    const userRedemptionCount = await prisma.offerRedemption.count({
      where: {
        offer_id: offer.id,
        user_id: userId,
        status: { in: ['RESERVED', 'REDEEMED'] },
      },
    });

    const perUserLimit = offer.usage_per_user || 1;
    if (userRedemptionCount >= perUserLimit) {
      return { eligible: false, reason: 'You have already used this offer' };
    }

    // New Users Only
    if (offer.new_users_only) {
      const totalPastOrders = await prisma.order.count({ where: { customer_id: userId } });
      const totalPastLabBookings = await prisma.labTestBooking.count({ where: { user_id: userId } });
      const totalPastAppointments = await prisma.doctorAppointment.count({ where: { patient_id: userId } });
      const grandTotalHistory = totalPastOrders + totalPastLabBookings + totalPastAppointments;

      if (grandTotalHistory > 0) {
        return { eligible: false, reason: 'This promotion is valid for new Medzoos users only' };
      }
    }
  }

  // 9. Provider / Category / Item Targeting
  if (offer.vendor_ids && Array.isArray(offer.vendor_ids) && offer.vendor_ids.length > 0) {
    const hasMatchingVendor = items.some((item) => offer.vendor_ids.includes(item.vendor_id));
    if (!hasMatchingVendor) {
      return { eligible: false, reason: 'Offer is not valid for participating pharmacies in cart' };
    }
  }

  if (offer.product_ids && Array.isArray(offer.product_ids) && offer.product_ids.length > 0) {
    const hasMatchingProduct = items.some((item) => offer.product_ids.includes(item.product_id || item.id));
    if (!hasMatchingProduct) {
      return { eligible: false, reason: 'Selected products in cart are not eligible for this offer' };
    }
  }

  if (offer.lab_test_ids && Array.isArray(offer.lab_test_ids) && offer.lab_test_ids.length > 0) {
    const hasMatchingLabTest = items.some((item) => offer.lab_test_ids.includes(item.lab_test_id || item.id));
    if (!hasMatchingLabTest) {
      return { eligible: false, reason: 'Selected lab tests are not eligible for this offer' };
    }
  }

  // 10. Discount Calculation
  let discountAmount = 0;
  let isFreeDelivery = false;

  if (offer.type === 'FREE_DELIVERY' || offer.discount_type === 'FREE_DELIVERY') {
    isFreeDelivery = true;
    discountAmount = deliveryFee;
  } else if (offer.discount_type === 'PERCENTAGE' || offer.percentage_value > 0 || offer.discount_percentage > 0) {
    const pct = offer.percentage_value || offer.discount_percentage || 0;
    discountAmount = (subtotal * pct) / 100;
  } else if (offer.discount_type === 'FIXED' || offer.fixed_amount > 0) {
    discountAmount = offer.fixed_amount || 0;
  }

  // Cap at maximum discount
  if (offer.maximum_discount_amount && offer.maximum_discount_amount > 0) {
    discountAmount = Math.min(discountAmount, offer.maximum_discount_amount);
  }

  // Cap at subtotal
  discountAmount = Math.min(discountAmount, subtotal + (isFreeDelivery ? deliveryFee : 0));

  return {
    eligible: true,
    offerId: offer.id,
    title: offer.title,
    type: offer.type,
    discountAmount: Math.round(discountAmount),
    isFreeDelivery,
    finalSubtotal: Math.max(0, Math.round(subtotal - (isFreeDelivery ? 0 : discountAmount))),
  };
}

/**
 * Evaluates all active offers for cart/checkout to find best eligible offer.
 */
async function evaluateBestOffers({
  userId = null,
  serviceType = 'medicine',
  items = [],
  subtotal = 0,
  deliveryFee = 0,
  city = null,
  paymentMethod = null,
  promoCodeInput = null,
}) {
  const now = new Date();

  // Fetch active/scheduled public offers
  const activeOffers = await prisma.offer.findMany({
    where: {
      status: 'ACTIVE',
      is_active: true,
      start_at: { lte: now },
      end_at: { gte: now },
    },
    orderBy: { created_at: 'desc' },
  });

  const evaluationResults = [];

  for (const offer of activeOffers) {
    const res = await checkOfferEligibility({
      offer,
      userId,
      serviceType,
      items,
      subtotal,
      deliveryFee,
      city,
      paymentMethod,
      promoCodeInput,
    });

    if (res.eligible) {
      evaluationResults.push({
        offer,
        result: res,
      });
    }
  }

  // Separate monetary offers vs free delivery
  const monetaryOffers = evaluationResults.filter((item) => !item.result.isFreeDelivery);
  const freeDeliveryOffers = evaluationResults.filter((item) => item.result.isFreeDelivery);

  // Pick best monetary offer by max discount
  monetaryOffers.sort((a, b) => b.result.discountAmount - a.result.discountAmount);
  const bestMonetary = monetaryOffers[0] || null;

  // Pick best free delivery offer
  const bestFreeDelivery = freeDeliveryOffers[0] || null;

  let totalDiscount = 0;
  let selectedOffer = null;
  let selectedDeliveryOffer = null;

  if (bestMonetary) {
    selectedOffer = bestMonetary.offer;
    totalDiscount += bestMonetary.result.discountAmount;
  }

  if (bestFreeDelivery) {
    selectedDeliveryOffer = bestFreeDelivery.offer;
    totalDiscount += bestFreeDelivery.result.discountAmount;
  }

  const finalTotal = Math.max(0, subtotal + deliveryFee - totalDiscount);

  return {
    subtotal,
    deliveryFee: selectedDeliveryOffer ? 0 : deliveryFee,
    totalDiscount,
    finalTotal,
    bestOffer: selectedOffer
      ? {
          id: selectedOffer.id,
          title: selectedOffer.title,
          discountAmount: bestMonetary.result.discountAmount,
          promoCode: selectedOffer.promo_code,
        }
      : null,
    freeDeliveryOffer: selectedDeliveryOffer
      ? {
          id: selectedDeliveryOffer.id,
          title: selectedDeliveryOffer.title,
          savedDelivery: deliveryFee,
        }
      : null,
    availableOffersCount: evaluationResults.length,
    allEligibleOffers: evaluationResults.map((item) => ({
      id: item.offer.id,
      title: item.offer.title,
      type: item.offer.type,
      discountAmount: item.result.discountAmount,
      promoCode: item.offer.promo_code,
    })),
  };
}

module.exports = {
  checkOfferEligibility,
  evaluateBestOffers,
};
