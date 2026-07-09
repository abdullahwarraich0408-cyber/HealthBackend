const { getIO } = require('../config/socket');
const socketAuth = require('./middleware/socketAuth');
const { handleTelehealthEvents } = require('./telehealth.socket');
const { handleOrderEvents } = require('./order.socket');
const { logger } = require('../utils/logger');

const registerSockets = () => {
  try {
    const io = getIO();

    io.use(socketAuth);

    io.on('connection', (socket) => {
      socket.join(`${socket.user.role}-${socket.user.id}`);
      logger.info(`Socket connected and joined personal room: ${socket.user.role}-${socket.user.id}`);

      handleOrderEvents(socket);
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
