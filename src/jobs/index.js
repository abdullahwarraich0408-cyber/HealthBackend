const { logger } = require('../utils/logger');

// Init all node-cron jobs here
const initJobs = () => {
  logger.info('Scheduled jobs initialized');
};

module.exports = { initJobs };
