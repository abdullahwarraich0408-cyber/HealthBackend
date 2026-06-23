const http = require('http');
const app = require('./app');
const config = require('./config');
const { logger } = require('./utils/logger');
const socketServer = require('./config/socket');
const { registerSockets } = require('./sockets');

const PORT = config.env.PORT || 5000;

const server = http.createServer(app);

socketServer.init(server);
registerSockets();

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${config.env.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  // In production, you might want to exit the process
  // server.close(() => process.exit(1));
});
