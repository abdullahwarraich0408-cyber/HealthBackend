const { getIO } = require('../config/socket');
const socketAuth = require('./middleware/socketAuth');
const { handleTelehealthEvents } = require('./telehealth.socket');
const { logger } = require('../utils/logger');

const registerSockets = () => {
  try {
    const io = getIO();

    io.use(socketAuth);

    io.on('connection', (socket) => {
      socket.join(`${socket.user.role}-${socket.user.id}`);
      logger.info(`Socket connected and joined personal room: ${socket.user.role}-${socket.user.id}`);

      socket.on('join_order_room', (orderId) => {
        socket.join(`order-${orderId}`);
        logger.info(`Socket joined order room: order-${orderId}`);
      });

      handleTelehealthEvents(socket, io);

      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  } catch (err) {
    logger.error('Socket not initialized properly yet.');
  }
};

module.exports = { registerSockets };
