const resendProvider = require('./providers/resend');
const nodemailerProvider = require('./providers/nodemailer');
const { logger } = require('../../utils/logger');

const sendEmail = async (to, subject, html) => {
  try {
    // Try primary provider
    await resendProvider.sendEmail(to, subject, html);
  } catch (err) {
    logger.warn('Resend failed, falling back to Nodemailer');
    // Fallback
    await nodemailerProvider.sendEmail(to, subject, html);
  }
};

module.exports = { sendEmail };
