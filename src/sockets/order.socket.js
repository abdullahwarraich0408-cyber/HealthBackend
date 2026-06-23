const { logger } = require('../utils/logger');

const handleOrderEvents = (socket, io) => {
  socket.on('subscribe_order', (orderId) => {
    socket.join(`order-${orderId}`);
    logger.info(`Socket joined order room: order-${orderId}`);
  });
};

module.exports = { handleOrderEvents };
