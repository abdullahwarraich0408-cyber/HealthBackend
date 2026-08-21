const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { emitOrderUpdated, emitOrderNew } = require('../../utils/orderTracking.socket');
const { pickNextVendor, ACCEPT_TIMEOUT_SEC } = require('./vendor-assignment.service');
const { scheduleAcceptTimeout, clearAcceptTimeout } = require('./accept-timeout.manager');
const { scheduleQuotationExpiry, clearQuotationExpiry } = require('./quotation-expiry.manager');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const customerNotificationsService = require('../notifications/customer-notifications.service');
const inboxEvents = require('../notifications/inbox.events');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  QUOTATION_TTL_MS,
  normalizeOrderStatus,
  serializePrescriptionOrder,
} = require('./prescription-order.status');

const ORDER_INCLUDE = {
  items: { include: { product: { select: { id: true, name: true, price: true } } } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  current_vendor: { select: { id: true, business_name: true, average_rating: true } },
  assigned_vendor: { select: { id: true, business_name: true, average_rating: true } },
  assignment_logs: {
    include: { vendor: { select: { id: true, business_name: true } } },
    orderBy: { created_at: 'asc' },
  },
};

function parseRejectedIds(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function withSerialized(order) {
  return serializePrescriptionOrder(order);
}

function trackPrescriptionOrder(payload) {
  const { orderId, status, customerId, vendorId, event = 'updated', ...rest } = payload;
  if (event === 'new' && vendorId) {
    emitOrderNew({ orderId, vendorId, type: 'prescription', status, ...rest });
  }
  emitOrderUpdated({
    orderId,
    status,
    type: 'prescription',
    customerId,
    vendorId,
    ...rest,
  });
}

function computeLineTotal(items = []) {
  return items.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1),
    0
  );
}

async function assignToNextVendor(orderId) {
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return null;

  const status = normalizeOrderStatus(order.status);
  if (![ORDER_STATUS.FINDING_VENDOR, ORDER_STATUS.VENDOR_ASSIGNED].includes(status) && status !== 'awaiting_accept') {
    // allow finding_vendor only for reassignment loop
    if (status !== ORDER_STATUS.FINDING_VENDOR) return withSerialized(order);
  }
  if (![ORDER_STATUS.FINDING_VENDOR, 'awaiting_accept', ORDER_STATUS.VENDOR_ASSIGNED].includes(order.status) &&
      order.status !== ORDER_STATUS.FINDING_VENDOR) {
    if (order.status !== ORDER_STATUS.FINDING_VENDOR && order.status !== 'awaiting_accept') {
      // continue if explicitly finding
    }
  }
  if (!['finding_vendor', 'awaiting_accept', 'vendor_assigned'].includes(order.status)) {
    return withSerialized(order);
  }

  const rejectedIds = parseRejectedIds(order.rejected_vendor_ids);
  const next = await pickNextVendor(order, rejectedIds);

  if (!next) {
    const updated = await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.NO_VENDOR,
        current_vendor_id: null,
        accept_deadline: null,
        payment_status: PAYMENT_STATUS.NOT_REQUIRED,
      },
      include: ORDER_INCLUDE,
    });
    trackPrescriptionOrder({
      orderId,
      status: ORDER_STATUS.NO_VENDOR,
      customerId: order.customer_id,
    });
    return withSerialized(updated);
  }

  const acceptDeadline = new Date(Date.now() + ACCEPT_TIMEOUT_SEC * 1000);
  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.VENDOR_ASSIGNED,
      current_vendor_id: next.vendor.id,
      distance_km: next.distanceKm,
      eta_minutes: next.eta_minutes,
      accept_deadline: acceptDeadline,
      assignment_attempts: { increment: 1 },
    },
    include: ORDER_INCLUDE,
  });

  await prisma.prescriptionAssignmentLog.create({
    data: {
      prescription_order_id: orderId,
      vendor_id: next.vendor.id,
      action: 'offered',
      score: next.score,
    },
  });

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.VENDOR_ASSIGNED,
    customerId: order.customer_id,
    vendorId: next.vendor.id,
    event: 'new',
    acceptDeadline: acceptDeadline.toISOString(),
    timeoutSeconds: ACCEPT_TIMEOUT_SEC,
  });

  await vendorNotificationsService.createVendorNotification({
    vendorId: next.vendor.id,
    type: 'prescription_offer',
    title: 'New prescription assignment',
    message: `Prescription order ${orderId.slice(0, 8)} is awaiting your response.`,
    data: { orderId, timeoutSeconds: ACCEPT_TIMEOUT_SEC, customerId: order.customer_id },
  });

  await scheduleAcceptTimeout(orderId);
  return withSerialized(updated);
}

async function createPrescriptionOrder(customerId, payload) {
  const { file_url, delivery_address, delivery_type, medicines } = payload;
  const items =
    Array.isArray(medicines) && medicines.length
      ? medicines
      : [{ name: 'Prescription medicines', quantity: 1, unit_price: 0 }];

  const estimatedValue = computeLineTotal(items);

  const order = await prisma.prescriptionOrder.create({
    data: {
      customer_id: customerId,
      file_url,
      delivery_address,
      delivery_type: delivery_type || 'standard',
      estimated_value: estimatedValue,
      total_amount: 0,
      medicine_count: items.length,
      status: ORDER_STATUS.FINDING_VENDOR,
      payment_status: PAYMENT_STATUS.NOT_REQUIRED,
      items: {
        create: items.map((item) => ({
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          product_id: item.product_id || null,
        })),
      },
    },
    include: ORDER_INCLUDE,
  });

  await inboxEvents.prescriptionCreated({ order });
  return assignToNextVendor(order.id);
}

async function handleAcceptTimeout(orderId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (![ORDER_STATUS.VENDOR_ASSIGNED, 'awaiting_accept'].includes(order.status)) return;

  const rejectedIds = [...parseRejectedIds(order.rejected_vendor_ids), order.current_vendor_id].filter(Boolean);

  await prisma.prescriptionAssignmentLog.create({
    data: {
      prescription_order_id: orderId,
      vendor_id: order.current_vendor_id,
      action: 'timeout',
    },
  });

  await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      rejected_vendor_ids: rejectedIds,
      current_vendor_id: null,
      accept_deadline: null,
      status: ORDER_STATUS.FINDING_VENDOR,
    },
  });

  trackPrescriptionOrder({
    orderId,
    status: 'expired',
    vendorId: order.current_vendor_id,
  });

  await assignToNextVendor(orderId);
}

async function vendorRespond(orderId, vendorId, action) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.current_vendor_id !== vendorId) throw new AppError('This order is not assigned to you', 403);
  if (![ORDER_STATUS.VENDOR_ASSIGNED, 'awaiting_accept'].includes(order.status)) {
    throw new AppError('Order is no longer awaiting acceptance', 400);
  }

  clearAcceptTimeout(orderId);

  if (action === 'decline') {
    const rejectedIds = [...parseRejectedIds(order.rejected_vendor_ids), vendorId];
    await prisma.prescriptionAssignmentLog.create({
      data: { prescription_order_id: orderId, vendor_id: vendorId, action: 'declined' },
    });
    await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        rejected_vendor_ids: rejectedIds,
        current_vendor_id: null,
        accept_deadline: null,
        status: ORDER_STATUS.FINDING_VENDOR,
      },
    });
    return assignToNextVendor(orderId);
  }

  await prisma.prescriptionAssignmentLog.create({
    data: { prescription_order_id: orderId, vendor_id: vendorId, action: 'accepted' },
  });

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.PHARMACY_REVIEWING,
      assigned_vendor_id: vendorId,
      current_vendor_id: vendorId,
      accept_deadline: null,
    },
    include: ORDER_INCLUDE,
  });

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.PHARMACY_REVIEWING,
    customerId: order.customer_id,
    vendorId,
  });

  await customerNotificationsService.notifyOrderStatusChange?.(order.customer_id, {
    orderId,
    status: ORDER_STATUS.PHARMACY_REVIEWING,
    orderType: 'prescription',
  }).catch(() => {});

  return withSerialized(updated);
}

/**
 * Pharmacy submits locked quotation (stock + prices).
 * Moves to awaiting_customer_confirmation with payment_status=pending.
 */
async function submitQuotation(orderId, vendorId, payload = {}) {
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.assigned_vendor_id !== vendorId) throw new AppError('Unauthorized', 403);

  const status = normalizeOrderStatus(order.status);
  if (![ORDER_STATUS.PHARMACY_REVIEWING, 'accepted', 'stock_pending'].includes(status) &&
      ![ORDER_STATUS.PHARMACY_REVIEWING, 'accepted', 'stock_pending'].includes(order.status)) {
    throw new AppError('Quotation can only be submitted while pharmacy is reviewing', 400);
  }

  if (order.quotation_locked_at && order.status === ORDER_STATUS.AWAITING_PAYMENT) {
    throw new AppError('Quotation is locked. Customer must approve any price change.', 400);
  }

  const { items, delivery_fee = 0, stock_status } = payload;

  if (Array.isArray(items) && items.length) {
    for (const row of items) {
      if (!row.id) continue;
      await prisma.prescriptionOrderItem.updateMany({
        where: { id: row.id, prescription_order_id: orderId },
        data: {
          ...(row.availability ? { availability: row.availability } : {}),
          ...(row.unit_price != null ? { unit_price: Number(row.unit_price) } : {}),
          ...(row.quantity != null ? { quantity: Number(row.quantity) } : {}),
          ...(row.name ? { name: String(row.name) } : {}),
          ...(row.product_id ? { product_id: row.product_id } : {}),
          ...(row.matched_quantity != null ? { matched_quantity: Number(row.matched_quantity) } : {}),
        },
      });
    }
  }

  const refreshedItems = await prisma.prescriptionOrderItem.findMany({
    where: { prescription_order_id: orderId },
  });

  const availableItems = refreshedItems.filter((item) => item.availability === 'available');
  const unavailableItems = refreshedItems.filter((item) => item.availability === 'unavailable');
  const hasAvailable = availableItems.length > 0;
  const hasUnavailable = unavailableItems.length > 0;

  const resolvedStock =
    stock_status ||
    (hasUnavailable && hasAvailable ? 'partial' : hasAvailable ? 'all_available' : 'unavailable');

  // No stock → release pharmacy and search again
  if (resolvedStock === 'unavailable' || !hasAvailable) {
    const rejectedIds = [...parseRejectedIds(order.rejected_vendor_ids), vendorId];
    await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        assigned_vendor_id: null,
        current_vendor_id: null,
        rejected_vendor_ids: rejectedIds,
        status: ORDER_STATUS.FINDING_VENDOR,
        stock_status: 'unavailable',
        quotation_locked_at: null,
        quotation_expires_at: null,
        payment_status: PAYMENT_STATUS.NOT_REQUIRED,
        total_amount: 0,
      },
    });
    return assignToNextVendor(orderId);
  }

  const subtotal = computeLineTotal(availableItems);
  const deliveryFee = Number(delivery_fee) || 0;
  const totalAmount = subtotal + deliveryFee;
  const expiresAt = new Date(Date.now() + QUOTATION_TTL_MS);

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
      stock_status: resolvedStock,
      estimated_value: subtotal,
      total_amount: totalAmount,
      delivery_fee: deliveryFee,
      quotation_locked_at: new Date(),
      quotation_expires_at: expiresAt,
      quotation_version: { increment: 1 },
      payment_status: PAYMENT_STATUS.PENDING,
      payment_method: null,
      customer_confirmed: false,
    },
    include: ORDER_INCLUDE,
  });

  scheduleQuotationExpiry(orderId, expiresAt);

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
    customerId: order.customer_id,
    vendorId,
    total_amount: totalAmount,
    quotation_expires_at: expiresAt.toISOString(),
  });

  await inboxEvents.prescriptionQuotationReady?.({ order: updated }).catch(() => {});
  await customerNotificationsService.notifyOrderStatusChange(order.customer_id, {
    orderId,
    status: ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
    orderType: 'prescription',
  });

  try {
    const inbox = require('../notifications/inbox.service');
    await inbox.notify({
      recipientType: 'customer',
      recipientId: order.customer_id,
      type: 'prescription_quotation',
      title: 'Pharmacy quotation ready',
      message: `Review your prescription order (Rs ${totalAmount.toLocaleString()}). Pay within 30 minutes.`,
      link: `/prescription/${orderId}`,
      data: { orderId, totalAmount, expiresAt: expiresAt.toISOString() },
    });
  } catch {
    /* optional */
  }

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'PRESCRIPTION_QUOTATION_SUBMITTED',
    entity: 'prescription_order',
    entityId: orderId,
    details: { total_amount: totalAmount, stock_status: resolvedStock, expires_at: expiresAt },
  });

  return withSerialized(updated);
}

/** @deprecated Prefer submitQuotation — kept for older vendor UI */
async function confirmStock(orderId, vendorId, payload) {
  return submitQuotation(orderId, vendorId, {
    items: payload.items,
    stock_status: payload.stock_status,
    delivery_fee: payload.delivery_fee || 0,
  });
}

async function customerConfirm(orderId, customerId, confirmed) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.customer_id !== customerId) throw new AppError('Unauthorized', 403);

  const status = normalizeOrderStatus(order.status);
  if (
    ![ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, 'customer_review', 'stock_confirmed'].includes(status) &&
    ![ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, 'customer_review'].includes(order.status)
  ) {
    throw new AppError('Order is not awaiting your review', 400);
  }

  if (order.quotation_expires_at && new Date(order.quotation_expires_at) < new Date()) {
    await expireQuotation(orderId);
    throw new AppError('This quotation has expired. Please request a new one.', 400);
  }

  if (!confirmed) {
    clearQuotationExpiry(orderId);
    const cancelled = await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.CANCELLED,
        customer_confirmed: false,
        payment_status: PAYMENT_STATUS.NOT_REQUIRED,
        cancellation_reason: 'customer_cancelled',
        quotation_expires_at: null,
      },
      include: ORDER_INCLUDE,
    });
    trackPrescriptionOrder({
      orderId,
      status: ORDER_STATUS.CANCELLED,
      customerId,
      vendorId: order.assigned_vendor_id,
    });
    return withSerialized(cancelled);
  }

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.AWAITING_PAYMENT,
      customer_confirmed: true,
      payment_status: PAYMENT_STATUS.PENDING,
    },
    include: ORDER_INCLUDE,
  });

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.AWAITING_PAYMENT,
    customerId,
    vendorId: order.assigned_vendor_id,
  });

  return withSerialized(updated);
}

/**
 * Customer chooses Stripe or COD while awaiting_payment.
 */
async function selectPaymentMethod(orderId, customerId, paymentMethod) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.customer_id !== customerId) throw new AppError('Unauthorized', 403);
  if (normalizeOrderStatus(order.status) !== ORDER_STATUS.AWAITING_PAYMENT && order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
    throw new AppError('Order is not awaiting payment', 400);
  }
  if (order.quotation_expires_at && new Date(order.quotation_expires_at) < new Date()) {
    await expireQuotation(orderId);
    throw new AppError('This quotation has expired', 400);
  }
  if (![PAYMENT_METHOD.STRIPE, PAYMENT_METHOD.COD].includes(paymentMethod)) {
    throw new AppError('payment_method must be stripe or cod', 400);
  }

  if (paymentMethod === PAYMENT_METHOD.COD) {
    clearQuotationExpiry(orderId);
    const updated = await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        payment_method: PAYMENT_METHOD.COD,
        payment_status: PAYMENT_STATUS.PENDING,
        status: ORDER_STATUS.CONFIRMED,
      },
      include: ORDER_INCLUDE,
    });

    trackPrescriptionOrder({
      orderId,
      status: ORDER_STATUS.CONFIRMED,
      customerId,
      vendorId: order.assigned_vendor_id,
      payment_method: PAYMENT_METHOD.COD,
    });

    if (order.assigned_vendor_id) {
      await vendorNotificationsService.createVendorNotification({
        vendorId: order.assigned_vendor_id,
        type: 'prescription_confirmed_cod',
        title: 'Prescription confirmed (COD)',
        message: `Order ${orderId.slice(0, 8)} confirmed with cash on delivery. You may start packing.`,
        data: { orderId, payment_method: 'cod', total_amount: order.total_amount },
      });
    }

    return withSerialized(updated);
  }

  // Stripe — stay on awaiting_payment; checkout session created by payments module
  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      payment_method: PAYMENT_METHOD.STRIPE,
      payment_status: PAYMENT_STATUS.PENDING,
    },
    include: ORDER_INCLUDE,
  });

  return withSerialized(updated);
}

async function markPrescriptionPaid(orderId, { sessionId, customerId } = {}) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (customerId && order.customer_id !== customerId) throw new AppError('Unauthorized', 403);

  if (order.payment_status === PAYMENT_STATUS.PAID && order.status === ORDER_STATUS.CONFIRMED) {
    return withSerialized(await prisma.prescriptionOrder.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  }

  clearQuotationExpiry(orderId);

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      payment_status: PAYMENT_STATUS.PAID,
      payment_method: order.payment_method || PAYMENT_METHOD.STRIPE,
      status: ORDER_STATUS.CONFIRMED,
      paid_at: new Date(),
      stripe_session_id: sessionId || order.stripe_session_id,
      quotation_expires_at: null,
    },
    include: ORDER_INCLUDE,
  });

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.CONFIRMED,
    customerId: order.customer_id,
    vendorId: order.assigned_vendor_id,
    payment_status: PAYMENT_STATUS.PAID,
  });

  if (order.assigned_vendor_id) {
    await vendorNotificationsService.createVendorNotification({
      vendorId: order.assigned_vendor_id,
      type: 'prescription_paid',
      title: 'Prescription payment received',
      message: `Payment received for order ${orderId.slice(0, 8)}. You may start packing.`,
      data: { orderId, payment_status: 'paid' },
    });
  }

  return withSerialized(updated);
}

/** Vendor/rider marks COD collected */
async function markCodCollected(orderId, vendorId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.assigned_vendor_id !== vendorId) throw new AppError('Unauthorized', 403);
  if (order.payment_method !== PAYMENT_METHOD.COD) {
    throw new AppError('This order is not cash on delivery', 400);
  }
  if (order.payment_status === PAYMENT_STATUS.PAID) {
    return withSerialized(await prisma.prescriptionOrder.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }));
  }

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      payment_status: PAYMENT_STATUS.PAID,
      paid_at: new Date(),
    },
    include: ORDER_INCLUDE,
  });

  return withSerialized(updated);
}

async function expireQuotation(orderId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const status = normalizeOrderStatus(order.status);
  const waiting =
    [ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, ORDER_STATUS.AWAITING_PAYMENT].includes(status) ||
    [ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, ORDER_STATUS.AWAITING_PAYMENT, 'customer_review'].includes(
      order.status
    );

  if (!waiting) return withSerialized(order);
  if (order.payment_status === PAYMENT_STATUS.PAID) return withSerialized(order);

  clearQuotationExpiry(orderId);

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.CANCELLED,
      payment_status: PAYMENT_STATUS.FAILED,
      cancellation_reason: 'quotation_expired',
      quotation_expires_at: null,
    },
    include: ORDER_INCLUDE,
  });

  trackPrescriptionOrder({
    orderId,
    status: ORDER_STATUS.CANCELLED,
    customerId: order.customer_id,
    vendorId: order.assigned_vendor_id,
  });

  try {
    const inbox = require('../notifications/inbox.service');
    await inbox.notify({
      recipientType: 'customer',
      recipientId: order.customer_id,
      type: 'prescription_expired',
      title: 'Quotation expired',
      message: 'Your prescription quotation expired before payment. Please upload again if you still need the medicines.',
      link: '/prescription',
      data: { orderId },
    });
    if (order.assigned_vendor_id) {
      await vendorNotificationsService.createVendorNotification({
        vendorId: order.assigned_vendor_id,
        type: 'prescription_expired',
        title: 'Quotation expired',
        message: `Customer did not pay for order ${orderId.slice(0, 8)} in time. Stock can be released.`,
        data: { orderId },
      });
    }
  } catch {
    /* optional */
  }

  return withSerialized(updated);
}

const DELIVERY_STATUS_MAP = {
  packing: ORDER_STATUS.PACKING,
  packed: ORDER_STATUS.PACKING,
  ready_for_pickup: ORDER_STATUS.READY_FOR_PICKUP,
  rider_assigned: ORDER_STATUS.READY_FOR_PICKUP,
  out_for_delivery: ORDER_STATUS.OUT_FOR_DELIVERY,
  delivered: ORDER_STATUS.DELIVERED,
};

async function updateDeliveryStatus(orderId, vendorId, status) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.assigned_vendor_id !== vendorId) throw new AppError('Unauthorized', 403);

  const next = DELIVERY_STATUS_MAP[status] || status;
  if (
    ![
      ORDER_STATUS.PACKING,
      ORDER_STATUS.READY_FOR_PICKUP,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.DELIVERED,
    ].includes(next)
  ) {
    throw new AppError('Invalid delivery status', 400);
  }

  // Packing only after confirmed (paid or COD confirmed)
  if (next === ORDER_STATUS.PACKING && order.status !== ORDER_STATUS.CONFIRMED && order.status !== 'confirmed') {
    throw new AppError('Order must be confirmed (paid or COD) before packing', 400);
  }

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: { status: next },
    include: ORDER_INCLUDE,
  });

  trackPrescriptionOrder({
    orderId,
    status: next,
    customerId: order.customer_id,
    vendorId,
  });

  await customerNotificationsService.notifyOrderStatusChange(order.customer_id, {
    orderId,
    status: next,
    orderType: 'prescription',
  });

  return withSerialized(updated);
}

async function markPacked(orderId, vendorId) {
  return updateDeliveryStatus(orderId, vendorId, ORDER_STATUS.PACKING);
}

async function getCustomerOrders(customerId) {
  const orders = await prisma.prescriptionOrder.findMany({
    where: { customer_id: customerId },
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return orders.map(withSerialized);
}

async function getVendorPendingOrders(vendorId) {
  const orders = await prisma.prescriptionOrder.findMany({
    where: {
      current_vendor_id: vendorId,
      status: {
        in: [
          ORDER_STATUS.VENDOR_ASSIGNED,
          'awaiting_accept',
          ORDER_STATUS.PHARMACY_REVIEWING,
          'accepted',
          'stock_pending',
          ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
          ORDER_STATUS.AWAITING_PAYMENT,
          ORDER_STATUS.CONFIRMED,
          ORDER_STATUS.PACKING,
          'packed',
          ORDER_STATUS.READY_FOR_PICKUP,
          'rider_assigned',
          ORDER_STATUS.OUT_FOR_DELIVERY,
        ],
      },
    },
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return orders.map(withSerialized);
}

async function vendorParticipatedInOrder(order, vendorId) {
  if (order.current_vendor_id === vendorId || order.assigned_vendor_id === vendorId) return true;
  return (order.assignment_logs || []).some((log) => log.vendor_id === vendorId);
}

async function getOrderById(orderId, userId, role) {
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw new AppError('Prescription order not found', 404);

  if (role === 'admin') return withSerialized(order);
  if (role === 'customer' && order.customer_id !== userId) throw new AppError('Unauthorized', 403);
  if (role === 'vendor' && !vendorParticipatedInOrder(order, userId)) {
    throw new AppError('Unauthorized', 403);
  }

  return withSerialized(order);
}

async function getAllPrescriptionOrders() {
  const orders = await prisma.prescriptionOrder.findMany({
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return orders.map(withSerialized);
}

async function getVendorPrescriptionHistory(vendorId) {
  const logs = await prisma.prescriptionAssignmentLog.findMany({
    where: { vendor_id: vendorId },
    select: { prescription_order_id: true },
  });
  const participatedIds = [...new Set(logs.map((entry) => entry.prescription_order_id))];

  const orders = await prisma.prescriptionOrder.findMany({
    where: {
      OR: [
        { id: { in: participatedIds } },
        { assigned_vendor_id: vendorId },
        { current_vendor_id: vendorId },
      ],
    },
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return orders.map(withSerialized);
}

async function retryVendorSearch(orderId, customerId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.customer_id !== customerId) throw new AppError('Unauthorized', 403);
  if (order.status !== ORDER_STATUS.NO_VENDOR && order.status !== 'no_vendor') {
    throw new AppError('Only orders with no available pharmacy can be retried', 400);
  }

  await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: ORDER_STATUS.FINDING_VENDOR,
      rejected_vendor_ids: [],
      current_vendor_id: null,
      assigned_vendor_id: null,
      accept_deadline: null,
      distance_km: null,
      eta_minutes: null,
      payment_status: PAYMENT_STATUS.NOT_REQUIRED,
    },
  });

  return assignToNextVendor(orderId);
}

async function reviewPrescription(orderId, vendorUser, payload = {}) {
  const { assertPermission } = require('../pharmacy/permissions');
  assertPermission(vendorUser, 'prescriptions.review');

  const vendorId = vendorUser.id;
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (!vendorParticipatedInOrder(order, vendorId)) throw new AppError('Unauthorized', 403);

  const status = String(payload.status || payload.decision || 'UNDER_REVIEW').toUpperCase();
  const review = await prisma.prescriptionReview.create({
    data: {
      vendor_id: vendorId,
      prescription_id: orderId,
      status,
      reviewed_by: vendorUser.accountId || vendorUser.staffId || vendorId,
      reviewed_at: new Date(),
      decision: payload.decision || status,
      notes: payload.notes || null,
      rejection_reason: payload.rejection_reason || null,
    },
  });

  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      if (!item.id) continue;
      await prisma.prescriptionOrderItem.update({
        where: { id: item.id },
        data: {
          ...(item.availability ? { availability: item.availability } : {}),
          ...(item.product_id ? { product_id: item.product_id } : {}),
          ...(item.decision ? { decision: item.decision } : {}),
          ...(item.matched_quantity != null ? { matched_quantity: Number(item.matched_quantity) } : {}),
          ...(item.unit_price != null ? { unit_price: Number(item.unit_price) } : {}),
        },
      });
    }
  }

  return { review, order: await getOrderById(orderId, vendorId, 'vendor') };
}

module.exports = {
  createPrescriptionOrder,
  assignToNextVendor,
  handleAcceptTimeout,
  vendorRespond,
  confirmStock,
  submitQuotation,
  customerConfirm,
  selectPaymentMethod,
  markPrescriptionPaid,
  markCodCollected,
  expireQuotation,
  updateDeliveryStatus,
  markPacked,
  getCustomerOrders,
  getVendorPendingOrders,
  getVendorPrescriptionHistory,
  getAllPrescriptionOrders,
  getOrderById,
  retryVendorSearch,
  reviewPrescription,
  ACCEPT_TIMEOUT_SEC,
  QUOTATION_TTL_MS,
  ORDER_STATUS,
  PAYMENT_STATUS,
};
