const { Worker } = require('bullmq');
const redis = require('../config/redis');
const prisma = require('../config/database');
const { logger } = require('../utils/logger');

const payoutWorker = new Worker('payouts', async (job) => {
  logger.info(`Processing vendor payout ${job.data.vendorId}`);
  
  const { vendorId, settlementId } = job.data;
  const settlement = settlementId
    ? await prisma.vendorSettlement.findUnique({ where: { id: settlementId } })
    : null;

  const payout = await prisma.payout.create({
    data: {
      vendor_id: vendorId,
      amount: settlement?.net_amount || 0,
      status: 'completed',
      gateway_reference: 'MOCK-PAYOUT-' + Date.now(),
      payout_date: new Date()
    }
  });

  if (settlement) {
    await prisma.vendorSettlement.update({
      where: { id: settlement.id },
      data: {
        status: 'released',
        released_at: new Date(),
        reference: payout.gateway_reference,
      },
    });
  }

  logger.info(`Payout processed for vendor ${vendorId}: ${payout.id}`);
}, { connection: redis });

module.exports = payoutWorker;
