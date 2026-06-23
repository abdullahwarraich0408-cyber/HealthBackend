const { Worker } = require('bullmq');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');
const env = require('../config/env');

function startOrderTimeoutWorker() {
  const useMemoryRedis =
    env.NODE_ENV === 'development' &&
    process.env.REDIS_ENABLED !== 'true';

  if (useMemoryRedis) {
    logger.info('Order timeout worker skipped (dev queue stub active)');
    return null;
  }

  const orderTimeoutWorker = new Worker(
    'orders',
    async (job) => {
      if (job.name === 'prescription-accept-timeout') {
        const service = require('../modules/prescription-orders/prescription-orders.service');
        await service.handleAcceptTimeout(job.data.orderId);
        logger.info(`Prescription accept timeout processed for ${job.data.orderId}`);
        return;
      }
      logger.info(`Processing order timeout for job ${job.id}`);
    },
    { connection: redis }
  );

  return orderTimeoutWorker;
}

module.exports = startOrderTimeoutWorker();
