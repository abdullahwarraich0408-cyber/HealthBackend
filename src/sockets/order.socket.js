const { logger } = require('../utils/logger');

function joinOrderRoom(socket, orderId) {
  if (!orderId) return;
  const id = String(orderId);
  socket.join(`order-${id}`);
  logger.info(`Socket joined order room: order-${id}`);
}

const handleOrderEvents = (socket) => {
  socket.on('join_order_room', joinOrderRoom);
  socket.on('subscribe_order', joinOrderRoom);
  socket.on('leave_order_room', (orderId) => {
    if (!orderId) return;
    socket.leave(`order-${String(orderId)}`);
  });
};

module.exports = { handleOrderEvents };
