const { Queue } = require('bullmq');
const redis = require('../config/redis');
const env = require('../config/env');

function createDevQueue(name) {
  return {
    name,
    add: async () => ({ id: `dev-${name}` }),
    close: async () => {},
  };
}

function createQueue(name) {
  const useMemoryRedis =
    env.NODE_ENV === 'development' &&
    process.env.REDIS_ENABLED !== 'true';

  if (useMemoryRedis) {
    return createDevQueue(name);
  }

  return new Queue(name, { connection: redis });
}

module.exports = {
  notificationQueue: createQueue('notifications'),
  orderQueue: createQueue('orders'),
  paymentQueue: createQueue('payments'),
  payoutQueue: createQueue('payouts'),
  commissionQueue: createQueue('commissions'),
  reportQueue: createQueue('reports'),
  searchSyncQueue: createQueue('search-sync'),
};
