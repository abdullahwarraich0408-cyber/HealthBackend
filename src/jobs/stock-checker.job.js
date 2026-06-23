const cron = require('node-cron');
const prisma = require('../config/database');
const { notificationQueue } = require('../queues');
const { logger } = require('../utils/logger');

const scheduleStockCheck = () => {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running stock check job');
    const lowStockProducts = await prisma.product.findMany({
      where: { stock: { lt: 10 } },
      include: { vendor: true }
    });

    for (const product of lowStockProducts) {
      await notificationQueue.add('low-stock-alert', {
        channel: 'email',
        type: 'low-stock',
        recipient: product.vendor.email,
        payload: { productName: product.name, stock: product.stock }
      });
    }
  });
};

module.exports = { scheduleStockCheck };
