const { logger } = require('../../../utils/logger');

const sendSMS = async (to, message) => {
  // Simulate hitting a local SMS provider like Jazz/Zong HTTP API
  logger.info(`Hitting local SMS Gateway for ${to}: ${message}`);
  
  // Simulated success
  return true;
};

module.exports = { sendSMS };
