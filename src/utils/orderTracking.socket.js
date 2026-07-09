const { getIO } = require('../config/socket');

/**
 * Broadcast order tracking updates to customer, vendor, and order-detail rooms.
 * @param {object} payload
 * @param {string} payload.orderId
 * @param {string} payload.status
 * @param {'medicine'|'prescription'|'lab'|'doctor'} [payload.type='medicine']
 * @param {string} [payload.customerId]
 * @param {string} [payload.vendorId]
 */
function emitOrderUpdated(payload) {
  const {
    orderId,
    status,
    type = 'medicine',
    customerId,
    vendorId,
    ...rest
  } = payload;

  const event = {
    orderId,
    status,
    type,
    updatedAt: new Date().toISOString(),
    ...rest,
  };

  try {
    const io = getIO();
    if (customerId) {
      io.to(`customer-${customerId}`).emit('order:updated', event);
    }
    if (vendorId) {
      io.to(`vendor-${vendorId}`).emit('order:updated', event);
    }
    if (orderId) {
      io.to(`order-${orderId}`).emit('order:updated', event);
    }
  } catch {
    // socket not ready
  }
}

/**
 * Notify a vendor about a new order assignment.
 */
function emitOrderNew(payload) {
  const { orderId, vendorId, type = 'medicine', ...rest } = payload;

  const event = {
    orderId,
    type,
    createdAt: new Date().toISOString(),
    ...rest,
  };

  try {
    const io = getIO();
    if (vendorId) {
      io.to(`vendor-${vendorId}`).emit('order:new', event);
    }
    if (orderId) {
      io.to(`order-${orderId}`).emit('order:new', event);
    }
  } catch {
    // socket not ready
  }
}

module.exports = { emitOrderUpdated, emitOrderNew };
