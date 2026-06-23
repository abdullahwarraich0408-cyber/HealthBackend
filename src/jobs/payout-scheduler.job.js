const { logger } = require('../utils/logger');

const schedulePayouts = () => {
  logger.info('Payout scheduler ran');
};

module.exports = { schedulePayouts };
