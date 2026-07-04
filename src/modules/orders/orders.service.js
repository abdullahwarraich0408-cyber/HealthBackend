const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { getIO } = require('../../config/socket');
const inventoryReservationsService = require('./inventory-reservations.service');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
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

        const order = await tx.order.create({
          data: {
            customer_id: customerId,
            vendor_id: group.vendor_id,
            total_amount: group.total_amount,
            requires_prescription: group.requires_prescription,
            delivery_address: deliveryAddress,
            items: {
              create: group.items,
            },
          },
          include: { items: true },
        });

        createdOrders.push(order);

        for (const item of group.items) {
          await tx.product.update({
            where: { id: item.product_id },
            data: { stock: { decrement: item.quantity } },
          });
        }

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
      getIO().emit(`vendor-${order.vendor_id}:new_order`, { orderId: order.id });
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

const getVendorOrders = async (vendorId) => {
  return prisma.order.findMany({
    where: { vendor_id: vendorId },
    include: {
      items: {
        include: {
          product: true
        }
      },
      customer: { select: { name: true, email: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

const updateOrderStatus = async (orderId, vendorId, status) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  
  if (!order) throw new AppError('Order not found', 404);
  if (order.vendor_id !== vendorId) throw new AppError('Unauthorized', 403);

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status }
  });

  try {
    getIO().emit(`customer-${order.customer_id}:order_status`, { 
      orderId, 
      status 
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
  updateOrderStatus
};
