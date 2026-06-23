const { logger } = require('../utils/logger');

// Init all workers here
const initWorkers = () => {
  logger.info('Workers initialized');
};

module.exports = { initWorkers };
