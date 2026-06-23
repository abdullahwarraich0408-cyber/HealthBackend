const cron = require('node-cron');
const { reportQueue } = require('../queues');
const { logger } = require('../utils/logger');

const scheduleReportGeneration = () => {
  // Run on the 1st of every month at midnight
  cron.schedule('0 0 1 * *', async () => {
    logger.info('Running monthly report generation job');
    await reportQueue.add('generate-monthly-report', { month: new Date().getMonth() });
  });
};

module.exports = { scheduleReportGeneration };
