const crypto = require('crypto');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const DEFAULT_RESERVATION_MINUTES = 15;

function mergeItems(items = []) {
  const merged = new Map();
  for (const item of items) {
    const productId = item.product_id || item.productId;
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  return Array.from(merged.entries()).map(([product_id, quantity]) => ({ product_id, quantity }));
}

async function expireReservations() {
  await prisma.inventoryReservation.updateMany({
    where: {
      status: 'active',
      expires_at: { lt: new Date() },
    },
    data: {
      status: 'expired',
      released_at: new Date(),
    },
  });
}

async function reserveInventory(customerId, items, options = {}) {
  await expireReservations();

  const mergedItems = mergeItems(items);
  if (!mergedItems.length) {
    throw new AppError('At least one valid cart item is required for reservation', 400);
  }

  const productIds = mergedItems.map((item) => item.product_id);
  const [products, activeReservations] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, vendor_id: true, stock: true, name: true },
    }),
    prisma.inventoryReservation.findMany({
      where: {
        product_id: { in: productIds },
        status: 'active',
        expires_at: { gt: new Date() },
      },
      select: { product_id: true, quantity: true },
    }),
  ]);

  if (products.length !== productIds.length) {
    throw new AppError('One or more products are unavailable for reservation', 404);
  }

  const activeByProduct = activeReservations.reduce((acc, reservation) => {
    acc[reservation.product_id] = (acc[reservation.product_id] || 0) + reservation.quantity;
    return acc;
  }, {});

  const productMap = new Map(products.map((product) => [product.id, product]));
  const lockKey = options.lockKey || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + DEFAULT_RESERVATION_MINUTES * 60 * 1000);

  const reservationRows = mergedItems.map((item) => {
    const product = productMap.get(item.product_id);
    const reservedQuantity = activeByProduct[item.product_id] || 0;
    const availableQuantity = Number(product.stock || 0) - reservedQuantity;

    if (availableQuantity < item.quantity) {
      throw new AppError(`Not enough reservable stock for ${product.name}`, 409);
    }

    return {
      product_id: item.product_id,
      vendor_id: product.vendor_id,
      customer_id: customerId,
      quantity: item.quantity,
      status: 'active',
      lock_key: lockKey,
      expires_at: expiresAt,
      source: options.source || 'checkout',
    };
  });

  const reservations = await prisma.$transaction(async (tx) => {
    const created = [];
    for (const row of reservationRows) {
      created.push(await tx.inventoryReservation.create({ data: row }));
    }
    return created;
  });

  return {
    lock_key: lockKey,
    expires_at: expiresAt,
    reservations,
  };
}

async function validateReservationLock(customerId, lockKey, items = []) {
  if (!lockKey) return null;

  await expireReservations();
  const reservations = await prisma.inventoryReservation.findMany({
    where: {
      lock_key: lockKey,
      customer_id: customerId,
      status: 'active',
      expires_at: { gt: new Date() },
    },
  });

  if (!reservations.length) {
    throw new AppError('Reservation lock expired or is invalid', 409);
  }

  const mergedItems = mergeItems(items);
  for (const item of mergedItems) {
    const matching = reservations.find((reservation) => reservation.product_id === item.product_id);
    if (!matching || matching.quantity < item.quantity) {
      throw new AppError('Reservation lock does not cover all requested quantities', 409);
    }
  }

  return reservations;
}

async function attachReservationsToOrder(lockKey, orderId) {
  if (!lockKey || !orderId) return;
  await prisma.inventoryReservation.updateMany({
    where: { lock_key: lockKey, status: 'active' },
    data: {
      order_id: orderId,
      status: 'consumed',
    },
  });
}

async function releaseReservationLock(lockKey) {
  if (!lockKey) return;
  await prisma.inventoryReservation.updateMany({
    where: {
      lock_key: lockKey,
      status: { in: ['active', 'pending_settlement'] },
    },
    data: {
      status: 'released',
      released_at: new Date(),
    },
  });
}

module.exports = {
  attachReservationsToOrder,
  expireReservations,
  releaseReservationLock,
  reserveInventory,
  validateReservationLock,
};
