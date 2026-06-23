const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { notificationQueue } = require('../../queues');
const { getIO } = require('../../config/socket');

const createOrdersFromCart = async (customerId, items, deliveryAddress) => {
  // 1. Group items by product_id to sum duplicate quantities
  const mergedItemsMap = {};
  for (const item of items) {
    if (mergedItemsMap[item.product_id]) {
      mergedItemsMap[item.product_id].quantity += item.quantity;
    } else {
      mergedItemsMap[item.product_id] = { ...item };
    }
  }
  const mergedItems = Object.values(mergedItemsMap);

  // First, fetch product details to get vendor_ids and true prices
  const productIds = mergedItems.map(item => item.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      offers: {
        where: { is_active: true, start_date: { lte: new Date() }, expiry_date: { gte: new Date() } }
      }
    }
  });

  if (products.length !== productIds.length) {
    throw new AppError('One or more products not found', 404);
  }

  // Create a map for quick lookup
  const productMap = {};
  products.forEach(p => {
    let finalPrice = p.price;
    if (p.offers && p.offers.length > 0) {
      finalPrice = finalPrice - (finalPrice * (p.offers[0].discount_percentage / 100));
    }
    productMap[p.id] = { ...p, finalPrice };
  });

  let globalSubtotal = 0;

  // Group by vendor
  const vendorGroups = {};
  for (const item of mergedItems) {
    const product = productMap[item.product_id];
    
    // Check stock
    if (product.stock < item.quantity) {
      throw new AppError(`Not enough stock for ${product.name}`, 400);
    }

    if (!vendorGroups[product.vendor_id]) {
      vendorGroups[product.vendor_id] = {
        vendor_id: product.vendor_id,
        items: [],
        subtotal: 0,
        total_amount: 0,
        requires_prescription: false
      };
    }

    const group = vendorGroups[product.vendor_id];
    group.items.push({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: product.finalPrice
    });
    const itemSubtotal = product.finalPrice * item.quantity;
    group.subtotal += itemSubtotal;
    globalSubtotal += itemSubtotal;
    
    // Basic logic: if category is 'prescription', flag it
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
    // Apply global shipping to the first order to match frontend combined logic
    if (!shippingApplied) {
      shipping = globalShipping;
      shippingApplied = true;
    }
    group.total_amount = group.subtotal + tax + shipping;
  }

  // 2. Create orders
  const createdOrders = [];
  
  // Use Prisma transaction
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
            create: group.items
          }
        },
        include: { items: true }
      });
      
      createdOrders.push(order);

      // Decrement stock
      for (const item of group.items) {
        await tx.product.update({
          where: { id: item.product_id },
          data: { stock: { decrement: item.quantity } }
        });
      }
    }
  });

  // Emitting sockets / queuing notifications
  for (const order of createdOrders) {
    // Notify vendor
    try {
      getIO().emit(`vendor-${order.vendor_id}:new_order`, { orderId: order.id });
    } catch (e) {
      // socket not ready or error
    }
    
    // Add to notification queue
    await notificationQueue.add('order-placed', {
      orderId: order.id,
      customerId,
      vendorId: order.vendor_id
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
  } catch (e) {}

  await notificationQueue.add('order-status-update', {
    orderId,
    customerId: order.customer_id,
    status
  });

  return updatedOrder;
};

module.exports = {
  createOrdersFromCart,
  getCustomerOrders,
  getVendorOrders,
  updateOrderStatus
};
