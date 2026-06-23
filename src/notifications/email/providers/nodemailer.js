const nodemailer = require('nodemailer');
const env = require('../../../config/env');
const { logger } = require('../../../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: process.env.SMTP_PORT || 2525,
  auth: {
    user: process.env.SMTP_USER || 'user',
    pass: process.env.SMTP_PASS || 'pass'
  }
});

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: '"PharmaHub" <noreply@pharmahub.com>',
      to,
      subject,
      html
    });
    logger.info(`Email sent via Nodemailer to ${to}`);
  } catch (error) {
    logger.error('Nodemailer error: ' + error.message);
    throw error;
  }
};

module.exports = { sendEmail };
