const { Resend } = require('resend');
const env = require('../../../config/env');

// const resend = new Resend(env.RESEND_API_KEY);

const sendEmail = async (to, subject, html) => {
  console.log(`Sending email via Resend to ${to}: ${subject}`);
};

module.exports = { sendEmail };
