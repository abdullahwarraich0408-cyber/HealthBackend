const { Worker } = require('bullmq');
const redis = require('../config/redis');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const payoutWorker = new Worker('payouts', async (job) => {
  logger.info(`Processing vendor payout ${job.data.vendorId}`);
  
  const { vendorId } = job.data;
  
  // Aggregate unpaid orders/commissions logic here
  // Mock payout execution
  const payout = await prisma.payout.create({
    data: {
      vendor_id: vendorId,
      amount: 1000, // Example calculated amount
      status: 'completed',
      gateway_reference: 'MOCK-PAYOUT-' + Date.now(),
      payout_date: new Date()
    }
  });

  logger.info(`Payout processed for vendor ${vendorId}: ${payout.id}`);
}, { connection: redis });

module.exports = payoutWorker;
