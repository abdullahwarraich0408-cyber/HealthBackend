const twilioProvider = require('./providers/twilio');
const localGateway = require('./providers/local-gateway');
const { logger } = require('../../utils/logger');

const sendSMS = async (to, message) => {
  try {
    // Try primary provider
    await twilioProvider.sendSMS(to, message);
  } catch (err) {
    logger.warn('Twilio SMS failed, falling back to local gateway');
    // Fallback
    await localGateway.sendSMS(to, message);
  }
};

module.exports = { sendSMS };
