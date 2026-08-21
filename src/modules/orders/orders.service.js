const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { emitOrderUpdated, emitOrderNew } = require('../../utils/orderTracking.socket');
const inventoryReservationsService = require('./inventory-reservations.service');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const customerNotificationsService = require('../notifications/customer-notifications.service');
const inboxEvents = require('../notifications/inbox.events');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');

const createOrdersFromCart = async (customerId, items, deliveryAddress, options = {}) => {
  const mergedItemsMap = {};
  for (const item of items) {
    if (mergedItemsMap[item.product_id]) {
      mergedItemsMap[item.product_id].quantity += item.quantity;
    } else {
      mergedItemsMap[item.product_id] = { ...item };
    }
  }
  const mergedItems = Object.values(mergedItemsMap);

  const reservationLock = options.reservationLock;
  let createdReservation = null;
  if (reservationLock) {
    await inventoryReservationsService.validateReservationLock(customerId, reservationLock, mergedItems);
  } else {
    createdReservation = await inventoryReservationsService.reserveInventory(customerId, mergedItems, {
      source: 'order_create',
    });
  }

  const activeLock = reservationLock || createdReservation?.lock_key || null;

  const productIds = mergedItems.map((item) => item.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      offers: {
        where: {
          is_active: true,
          start_date: { lte: new Date() },
          expiry_date: { gte: new Date() },
        },
      },
    },
  });

  if (products.length !== productIds.length) {
    throw new AppError('One or more products not found', 404);
  }

  const productMap = {};
  products.forEach((product) => {
    let finalPrice = product.price;
    if (product.offers && product.offers.length > 0) {
      finalPrice = finalPrice - (finalPrice * (product.offers[0].discount_percentage / 100));
    }
    productMap[product.id] = { ...product, finalPrice };
  });

  let globalSubtotal = 0;
  const vendorGroups = {};
  for (const item of mergedItems) {
    const product = productMap[item.product_id];
    if (product.stock < item.quantity) {
      throw new AppError(`Not enough stock for ${product.name}`, 400);
    }

    if (!vendorGroups[product.vendor_id]) {
      vendorGroups[product.vendor_id] = {
        vendor_id: product.vendor_id,
        items: [],
        subtotal: 0,
        total_amount: 0,
        requires_prescription: false,
      };
    }

    const group = vendorGroups[product.vendor_id];
    group.items.push({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: product.finalPrice,
    });
    const itemSubtotal = product.finalPrice * item.quantity;
    group.subtotal += itemSubtotal;
    globalSubtotal += itemSubtotal;

    if (product.category === 'prescription') {
      group.requires_prescription = true;
    }
  }

  const globalShipping = globalSubtotal > 2000 ? 0 : 150;
  let shippingApplied = false;

  for (const vendorId in vendorGroups) {
    const group = vendorGroups[vendorId];
    const tax = group.subtotal * 0.05;
    let shipping = 0;
    if (!shippingApplied) {
      shipping = globalShipping;
      shippingApplied = true;
    }
    group.total_amount = group.subtotal + tax + shipping;
  }

  const createdOrders = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const vendorId in vendorGroups) {
        const group = vendorGroups[vendorId];

        const year = new Date().getFullYear();
        const sequence = (await tx.order.count({
          where: { created_at: { gte: new Date(`${year}-01-01T00:00:00.000Z`) } },
        })) + createdOrders.length + 1;
        const { generateOrderNumber } = require('../pharmacy/order-transitions');
        const { calculateOrderFinancials } = require('../pharmacy/money');
        const vendor = await tx.vendor.findUnique({ where: { id: group.vendor_id } });
        const financials = calculateOrderFinancials({
          subtotal: group.subtotal,
          deliveryFee: group.total_amount - group.subtotal - group.subtotal * 0.05,
          commissionRate: vendor?.commission_rate,
        });

        const order = await tx.order.create({
          data: {
            customer_id: customerId,
            vendor_id: group.vendor_id,
            order_number: generateOrderNumber(sequence, year),
            total_amount: group.total_amount,
            subtotal: group.subtotal,
            platform_fee: financials.platformFee,
            commission_amount: financials.commission,
            vendor_net: financials.vendorNet,
            payment_status: 'unpaid',
            requires_prescription: group.requires_prescription,
            delivery_address: deliveryAddress,
            status: 'awaiting_payment',
            items: {
              create: group.items,
            },
          },
          include: { items: true },
        });

        createdOrders.push(order);

        const inventoryService = require('../inventory/inventory.service');
        for (const item of group.items) {
          await inventoryService.applyOrderStockChange(tx, {
            vendorId: group.vendor_id,
            productId: item.product_id,
            quantity: item.quantity,
            type: 'ORDER_RESERVED',
            referenceId: order.id,
            performedBy: customerId,
          });
        }

        await tx.orderEvent.create({
          data: {
            vendor_id: group.vendor_id,
            order_id: order.id,
            status: 'awaiting_payment',
            note: 'Order placed — awaiting Stripe payment',
            actor_id: customerId,
            actor_type: 'CUSTOMER',
          },
        });

        if (activeLock) {
          await tx.inventoryReservation.updateMany({
            where: {
              lock_key: activeLock,
              customer_id: customerId,
              status: 'active',
              product_id: { in: group.items.map((item) => item.product_id) },
            },
            data: {
              order_id: order.id,
              status: 'consumed',
            },
          });
        }
      }
    });
  } catch (error) {
    if (activeLock) {
      await inventoryReservationsService.releaseReservationLock(activeLock);
    }
    throw error;
  }

  for (const order of createdOrders) {
    try {
      emitOrderNew({
        orderId: order.id,
        vendorId: order.vendor_id,
        type: 'medicine',
        status: order.status,
      });
    } catch {
      // socket not ready
    }

    await vendorNotificationsService.createVendorNotification({
      vendorId: order.vendor_id,
      type: 'new_order',
      title: 'New order received',
      message: `A new order ${order.id.slice(0, 8)} is waiting for fulfillment.`,
      data: {
        orderId: order.id,
        customerId,
      },
    });

    await inboxEvents.newOrder({ order, customerId });

    await recordAuditEntry({
      vendorId: order.vendor_id,
      userId: customerId,
      action: 'ORDER_CREATED',
      entity: 'order',
      entityId: order.id,
      details: {
        total_amount: order.total_amount,
        item_count: order.items.length,
      },
    });
  }

  return createdOrders;
};

const getCustomerOrders = async (customerId) => {
  return prisma.order.findMany({
    where: { customer_id: customerId },
    include: {
      items: {
        include: {
          product: { select: { name: true, image_url: true } },
        },
      },
      vendor: { select: { business_name: true } },
    },
    orderBy: { created_at: 'desc' },
  });
};

const ORDER_INCLUDE = {
  items: {
    include: {
      product: true,
    },
  },
  customer: { select: { name: true, email: true, phone: true } },
  events: { orderBy: { created_at: 'asc' } },
};

const getVendorOrders = async (vendorId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  const search = String(query.search || '').trim();
  const status = query.status;

  const where = {
    vendor_id: vendorId,
    // Hide unpaid Stripe holds from pharmacy ops until payment clears
    NOT: {
      AND: [{ status: 'awaiting_payment' }, { payment_status: { in: ['unpaid', 'pending'] } }],
    },
    ...(status ? { status: { in: [status, status.toUpperCase(), status.toLowerCase()] } } : {}),
    ...(query.payment_status ? { payment_status: query.payment_status } : {}),
    ...(query.delivery_type || query.delivery_method
      ? { delivery_method: query.delivery_type || query.delivery_method }
      : {}),
    ...(query.prescription === 'true' ? { requires_prescription: true } : {}),
    ...(query.prescription === 'false' ? { requires_prescription: false } : {}),
    ...(query.from || query.to
      ? {
          created_at: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { order_number: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } },
            { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, page, pageSize, total };
};

const getVendorOrderById = async (orderId, vendorId) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, vendor_id: vendorId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw new AppError('Order not found', 404);
  return order;
};

const updateOrderStatus = async (orderId, vendorId, status, extra = {}) => {
  const {
    assertTransition,
    toCanonicalStatus,
    timestampFieldForStatus,
  } = require('../pharmacy/order-transitions');
  const inventoryService = require('../inventory/inventory.service');
  const { calculateOrderFinancials } = require('../pharmacy/money');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, vendor: true },
  });

  if (!order) throw new AppError('Order not found', 404);
  if (order.vendor_id !== vendorId) throw new AppError('Unauthorized', 403);

  const nextStatus = toCanonicalStatus(status);
  try {
    assertTransition(order.status, nextStatus);
  } catch (error) {
    throw new AppError(error.message || 'This order has already been updated.', 400);
  }

  if (nextStatus === 'REJECTED' && !extra.reason && !extra.rejection_reason) {
    throw new AppError('A rejection reason is required', 400);
  }

  const timestampField = timestampFieldForStatus(nextStatus);
  const updateData = {
    status: nextStatus,
    ...(timestampField ? { [timestampField]: new Date() } : {}),
    ...(nextStatus === 'REJECTED'
      ? {
          rejection_reason: extra.reason || extra.rejection_reason,
          cancelled_by: extra.cancelled_by || 'VENDOR',
          cancellation_reason: extra.reason || extra.rejection_reason,
        }
      : {}),
    ...(nextStatus === 'CANCELLED'
      ? {
          cancelled_by: extra.cancelled_by || 'VENDOR',
          cancellation_reason: extra.reason || extra.cancellation_reason || null,
        }
      : {}),
  };

  if (nextStatus === 'COMPLETED') {
    const financials = calculateOrderFinancials({
      subtotal: order.subtotal || order.total_amount,
      deliveryFee: order.delivery_fee,
      commissionRate: order.vendor?.commission_rate,
      refundAmount: order.refund_amount,
    });
    updateData.commission_amount = financials.commission;
    updateData.platform_fee = financials.platformFee;
    updateData.vendor_net = financials.vendorNet;
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const saved = await tx.order.update({
      where: { id: orderId },
      data: updateData,
    });

    await tx.orderEvent.create({
      data: {
        vendor_id: vendorId,
        order_id: orderId,
        status: nextStatus,
        note: extra.reason || extra.note || null,
        actor_id: extra.performedBy || vendorId,
        actor_type: extra.cancelled_by || 'VENDOR',
      },
    });

    if (['CANCELLED', 'REJECTED'].includes(nextStatus)) {
      for (const item of order.items) {
        await inventoryService.applyOrderStockChange(tx, {
          vendorId,
          productId: item.product_id,
          quantity: item.quantity,
          type: 'ORDER_RELEASED',
          referenceId: orderId,
          performedBy: vendorId,
        });
      }
    }

    if (nextStatus === 'COMPLETED') {
      for (const item of order.items) {
        await inventoryService.applyOrderStockChange(tx, {
          vendorId,
          productId: item.product_id,
          quantity: item.quantity,
          type: 'SALE',
          referenceId: orderId,
          performedBy: vendorId,
        });
      }
    }

    return saved;
  });

  try {
    emitOrderUpdated({
      orderId,
      status,
      type: 'medicine',
      customerId: order.customer_id,
      vendorId: order.vendor_id,
    });
  } catch (e) {
    // socket not ready
  }

  await vendorNotificationsService.createVendorNotification({
    vendorId,
    type: 'order_status_updated',
    title: 'Order status updated',
    message: `Order ${orderId.slice(0, 8)} is now ${status}.`,
    data: {
      orderId,
      customerId: order.customer_id,
      status,
    },
  });

  await customerNotificationsService.notifyOrderStatusChange(order.customer_id, {
    orderId,
    status,
    orderType: 'medicine',
  });

  await inboxEvents.orderStatus({
    orderId,
    customerId: order.customer_id,
    status,
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'ORDER_STATUS_UPDATED',
    entity: 'order',
    entityId: orderId,
    details: { status },
  });

  return updatedOrder;
};

module.exports = {
  createOrdersFromCart,
  getCustomerOrders,
  getVendorOrders,
  getVendorOrderById,
  updateOrderStatus
};
