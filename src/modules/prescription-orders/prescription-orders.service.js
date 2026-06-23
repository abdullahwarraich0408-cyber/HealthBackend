const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { getIO } = require('../../config/socket');
const { etaMinutes, resolveCoords, haversineKm } = require('../../utils/geo');
const { pickNextVendor, ACCEPT_TIMEOUT_SEC } = require('./vendor-assignment.service');
const { scheduleAcceptTimeout, clearAcceptTimeout } = require('./accept-timeout.manager');

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

function emit(event, payload) {
  try {
    getIO().emit(event, payload);
  } catch {
    // socket not ready
  }
}

function computeEstimatedValue(items = []) {
  return items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1), 0);
}

async function assignToNextVendor(orderId) {
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return null;
  if (!['finding_vendor', 'awaiting_accept'].includes(order.status)) return order;

  const rejectedIds = parseRejectedIds(order.rejected_vendor_ids);
  const next = await pickNextVendor(order, rejectedIds);

  if (!next) {
    const updated = await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        status: 'no_vendor',
        current_vendor_id: null,
        accept_deadline: null,
      },
      include: ORDER_INCLUDE,
    });
    emit(`customer-${order.customer_id}:prescription_order`, { orderId, status: 'no_vendor' });
    return updated;
  }

  const acceptDeadline = new Date(Date.now() + ACCEPT_TIMEOUT_SEC * 1000);
  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: 'awaiting_accept',
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

  emit(`vendor-${next.vendor.id}:prescription_order`, {
    orderId,
    order: updated,
    acceptDeadline: acceptDeadline.toISOString(),
    timeoutSeconds: ACCEPT_TIMEOUT_SEC,
  });
  emit(`customer-${order.customer_id}:prescription_order`, {
    orderId,
    status: 'awaiting_accept',
    vendor: updated.current_vendor,
  });

  await scheduleAcceptTimeout(orderId);
  return updated;
}

async function createPrescriptionOrder(customerId, payload) {
  const { file_url, delivery_address, delivery_type, medicines } = payload;
  const items = Array.isArray(medicines) && medicines.length
    ? medicines
    : [{ name: 'Prescription medicines', quantity: 1, unit_price: 0 }];

  const estimatedValue = computeEstimatedValue(items);

  const order = await prisma.prescriptionOrder.create({
    data: {
      customer_id: customerId,
      file_url,
      delivery_address,
      delivery_type: delivery_type || 'standard',
      estimated_value: estimatedValue,
      medicine_count: items.length,
      status: 'finding_vendor',
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

  return assignToNextVendor(order.id);
}

async function handleAcceptTimeout(orderId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'awaiting_accept') return;

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
      status: 'finding_vendor',
    },
  });

  emit(`vendor-${order.current_vendor_id}:prescription_order_expired`, { orderId });
  await assignToNextVendor(orderId);
}

async function vendorRespond(orderId, vendorId, action) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.current_vendor_id !== vendorId) throw new AppError('This order is not assigned to you', 403);
  if (order.status !== 'awaiting_accept') throw new AppError('Order is no longer awaiting acceptance', 400);

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
        status: 'finding_vendor',
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
      status: 'accepted',
      assigned_vendor_id: vendorId,
      current_vendor_id: vendorId,
      accept_deadline: null,
    },
    include: ORDER_INCLUDE,
  });

  emit(`customer-${order.customer_id}:prescription_order`, { orderId, status: 'accepted' });
  return updated;
}

async function confirmStock(orderId, vendorId, payload) {
  const order = await prisma.prescriptionOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.assigned_vendor_id !== vendorId) throw new AppError('Unauthorized', 403);
  if (!['accepted', 'stock_pending'].includes(order.status)) {
    throw new AppError('Stock can only be confirmed after accepting the order', 400);
  }

  const { stock_status, items } = payload;

  if (items?.length) {
    for (const itemUpdate of items) {
      await prisma.prescriptionOrderItem.updateMany({
        where: { id: itemUpdate.id, prescription_order_id: orderId },
        data: { availability: itemUpdate.availability },
      });
    }
  } else if (stock_status === 'all_available') {
    await prisma.prescriptionOrderItem.updateMany({
      where: { prescription_order_id: orderId },
      data: { availability: 'available' },
    });
  } else if (stock_status === 'unavailable') {
    await prisma.prescriptionOrderItem.updateMany({
      where: { prescription_order_id: orderId },
      data: { availability: 'unavailable' },
    });
  }

  const refreshedItems = await prisma.prescriptionOrderItem.findMany({
    where: { prescription_order_id: orderId },
  });

  const hasUnavailable = refreshedItems.some((item) => item.availability === 'unavailable');
  const hasAvailable = refreshedItems.some((item) => item.availability === 'available');
  const resolvedStockStatus =
    stock_status ||
    (hasUnavailable && hasAvailable ? 'partial' : hasAvailable ? 'all_available' : 'unavailable');

  let nextStatus = 'stock_confirmed';
  if (resolvedStockStatus === 'partial') nextStatus = 'customer_review';
  if (resolvedStockStatus === 'unavailable') nextStatus = 'no_vendor';

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      stock_status: resolvedStockStatus,
      status: nextStatus,
      estimated_value: refreshedItems
        .filter((item) => item.availability === 'available')
        .reduce((sum, item) => sum + item.unit_price * item.quantity, order.estimated_value),
    },
    include: ORDER_INCLUDE,
  });

  if (resolvedStockStatus === 'all_available') {
    await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: { status: 'confirmed', customer_confirmed: true },
    });
    updated.status = 'confirmed';
    updated.customer_confirmed = true;
  }

  if (resolvedStockStatus === 'unavailable') {
    const rejectedIds = [...parseRejectedIds(order.rejected_vendor_ids), vendorId];
    await prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: {
        assigned_vendor_id: null,
        current_vendor_id: null,
        rejected_vendor_ids: rejectedIds,
        status: 'finding_vendor',
        stock_status: null,
      },
    });
    await assignToNextVendor(orderId);
  } else {
    emit(`customer-${order.customer_id}:prescription_order`, {
      orderId,
      status: updated.status,
      stock_status: resolvedStockStatus,
    });
  }

  return prisma.prescriptionOrder.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
}

async function customerConfirm(orderId, customerId, confirmed) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.customer_id !== customerId) throw new AppError('Unauthorized', 403);
  if (order.status !== 'customer_review') throw new AppError('Order is not awaiting your review', 400);

  if (!confirmed) {
    return prisma.prescriptionOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled', customer_confirmed: false },
      include: ORDER_INCLUDE,
    });
  }

  return prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: { status: 'confirmed', customer_confirmed: true },
    include: ORDER_INCLUDE,
  });
}

const DELIVERY_STATUSES = ['packed', 'rider_assigned', 'out_for_delivery', 'delivered'];

async function updateDeliveryStatus(orderId, vendorId, status) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.assigned_vendor_id !== vendorId) throw new AppError('Unauthorized', 403);
  if (!DELIVERY_STATUSES.includes(status)) throw new AppError('Invalid delivery status', 400);

  const updated = await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: { status },
    include: ORDER_INCLUDE,
  });

  emit(`customer-${order.customer_id}:prescription_order`, { orderId, status });
  return updated;
}

async function markPacked(orderId, vendorId) {
  return updateDeliveryStatus(orderId, vendorId, 'packed');
}

async function getCustomerOrders(customerId) {
  return prisma.prescriptionOrder.findMany({
    where: { customer_id: customerId },
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
}

async function getVendorPendingOrders(vendorId) {
  return prisma.prescriptionOrder.findMany({
    where: {
      current_vendor_id: vendorId,
      status: { in: ['awaiting_accept', 'accepted', 'stock_pending', 'confirmed', 'packed', 'rider_assigned', 'out_for_delivery'] },
    },
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
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

  if (role === 'admin') return order;
  if (role === 'customer' && order.customer_id !== userId) throw new AppError('Unauthorized', 403);
  if (role === 'vendor' && !vendorParticipatedInOrder(order, userId)) {
    throw new AppError('Unauthorized', 403);
  }

  return order;
}

async function getAllPrescriptionOrders() {
  return prisma.prescriptionOrder.findMany({
    include: ORDER_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
}

async function getVendorPrescriptionHistory(vendorId) {
  const logs = await prisma.prescriptionAssignmentLog.findMany({
    where: { vendor_id: vendorId },
    select: { prescription_order_id: true },
  });
  const participatedIds = [...new Set(logs.map((entry) => entry.prescription_order_id))];

  return prisma.prescriptionOrder.findMany({
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
}

async function retryVendorSearch(orderId, customerId) {
  const order = await prisma.prescriptionOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Prescription order not found', 404);
  if (order.customer_id !== customerId) throw new AppError('Unauthorized', 403);
  if (order.status !== 'no_vendor') {
    throw new AppError('Only orders with no available pharmacy can be retried', 400);
  }

  await prisma.prescriptionOrder.update({
    where: { id: orderId },
    data: {
      status: 'finding_vendor',
      rejected_vendor_ids: [],
      current_vendor_id: null,
      assigned_vendor_id: null,
      accept_deadline: null,
      distance_km: null,
      eta_minutes: null,
    },
  });

  return assignToNextVendor(orderId);
}

module.exports = {
  createPrescriptionOrder,
  assignToNextVendor,
  handleAcceptTimeout,
  vendorRespond,
  confirmStock,
  customerConfirm,
  updateDeliveryStatus,
  markPacked,
  getCustomerOrders,
  getVendorPendingOrders,
  getVendorPrescriptionHistory,
  getAllPrescriptionOrders,
  getOrderById,
  retryVendorSearch,
  ACCEPT_TIMEOUT_SEC,
};
