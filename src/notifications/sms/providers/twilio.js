const env = require('../../../config/env');

// const twilioClient = require('twilio')(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

const sendSMS = async (to, message) => {
  console.log(`Sending SMS to ${to}: ${message}`);
};

module.exports = { sendSMS };
