const { logger } = require('../utils/logger');

const dispatchNotification = async (payload) => {
  logger.info(`Dispatching notification: ${JSON.stringify(payload)}`);
  // Route to email or SMS
};

module.exports = { dispatchNotification };
