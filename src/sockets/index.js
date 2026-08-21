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
      const role = socket.user?.role || 'customer';
      const userId = socket.user?.id;
      if (userId) {
        socket.join(`${role}-${userId}`);
        // Alias rooms so inbox emits always reach the client
        if (role === 'customer' || role === 'user') {
          socket.join(`customer-${userId}`);
        }
        if (role === 'doctor') {
          socket.join(`doctor-${userId}`);
        }
        if (role === 'lab' || role === 'lab_partner') {
          socket.join(`lab-${userId}`);
          socket.join(`lab_partner-${userId}`);
        }
        if (role === 'vendor') {
          socket.join(`vendor-${userId}`);
        }
      }
      if (role === 'admin') {
        socket.join('admins');
      }
      logger.info(`Socket connected and joined personal room: ${role}-${userId}`);

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
