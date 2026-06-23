const { Worker } = require('bullmq');
const redis = require('../config/redis');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const commissionWorker = new Worker('commissions', async (job) => {
  logger.info(`Processing commission for order ${job.data.orderId}`);
  
  const order = await prisma.order.findUnique({
    where: { id: job.data.orderId },
    include: { vendor: true }
  });

  if (!order) return;

  const commissionRate = order.vendor.commission_rate || 0;
  const commissionAmount = (order.total_amount * commissionRate) / 100;

  await prisma.commission.create({
    data: {
      order_id: order.id,
      vendor_id: order.vendor_id,
      amount: commissionAmount,
      rate_applied: commissionRate
    }
  });

  logger.info(`Commission calculated for order ${order.id}`);
}, { connection: redis });

module.exports = commissionWorker;
