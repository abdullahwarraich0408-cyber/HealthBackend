const { Worker } = require('bullmq');
const redis = require('../config/redis');
const emailService = require('../notifications/email/email.service');
const smsService = require('../notifications/sms/sms.service');
const { sendPushToTokens } = require('../notifications/push/push.service');
const { logger } = require('../utils/logger');

const notificationWorker = new Worker('notifications', async (job) => {
  const { type, recipient, payload, channel, tokens } = job.data;
  
  logger.info(`Dispatching ${channel} notification to ${recipient}`);

  try {
    if (channel === 'email') {
      await emailService.sendEmail(recipient, `Update regarding ${type}`, `<p>Payload: ${JSON.stringify(payload)}</p>`);
    } else if (channel === 'sms') {
      await smsService.sendSMS(recipient, `Update: ${type}`);
    } else if (channel === 'push') {
      const targetTokens = tokens || (recipient ? [recipient] : []);
      await sendPushToTokens(targetTokens, {
        title: payload?.title || `Update: ${type}`,
        body: payload?.body || payload?.message || 'You have a new update.',
        type,
        data: payload?.data || {},
      });
    }
  } catch (error) {
    logger.error(`Notification dispatch failed: ${error.message}`);
    throw error;
  }
}, { connection: redis });

module.exports = notificationWorker;
