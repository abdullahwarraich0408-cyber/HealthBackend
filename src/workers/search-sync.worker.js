const { Worker } = require('bullmq');
const redis = require('../config/redis');
const meiliClient = require('../config/meilisearch');
const { logger } = require('../utils/logger');

const searchSyncWorker = new Worker('search-sync', async (job) => {
  logger.info(`Processing search sync job ${job.id}`);
  
  const { action, product, params } = job.data;
  const index = meiliClient.index('products');

  try {
    if (['create', 'update', 'upsert'].includes(action)) {
      await index.addDocuments([product]);
      logger.info(`Synced product ${product.id} to Meilisearch`);
    } else if (['delete'].includes(action)) {
      // Basic delete handling (deleteMany requires more complex mapping)
      const idToDelete = params.where?.id;
      if (idToDelete) {
        await index.deleteDocument(idToDelete);
        logger.info(`Deleted product ${idToDelete} from Meilisearch`);
      }
    }
  } catch (error) {
    logger.error(`Search Sync Error: ${error.message}`);
    throw error;
  }
}, { connection: redis });

searchSyncWorker.on('failed', (job, err) => {
  logger.error(`Search sync job ${job.id} failed: ${err.message}`);
});

module.exports = searchSyncWorker;
