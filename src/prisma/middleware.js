const prisma = require('../config/database');
const { searchSyncQueue } = require('../queues');

const setupPrismaMiddlewares = () => {
  prisma.$use(async (params, next) => {
    const result = await next(params);

    // Sync products to Meilisearch via BullMQ whenever they are modified
    if (params.model === 'Product') {
      if (['create', 'update', 'upsert'].includes(params.action)) {
        await searchSyncQueue.add('sync-product', {
          action: params.action,
          product: result
        });
      } else if (['delete', 'deleteMany'].includes(params.action)) {
        await searchSyncQueue.add('delete-product', {
          action: params.action,
          params: params.args
        });
      }
    }

    return result;
  });
};

module.exports = setupPrismaMiddlewares;
