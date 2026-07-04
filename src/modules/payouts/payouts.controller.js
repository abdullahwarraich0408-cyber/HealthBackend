const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const { sendResponse } = require('../../utils/response');
const vendorFinanceService = require('../vendors/vendor-finance.service');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');

const getMyPayouts = catchAsync(async (req, res) => {
  const payouts = await prisma.payout.findMany({
    where: { vendor_id: req.user.id },
    orderBy: { created_at: 'desc' }
  });
  sendResponse(res, 200, { payouts }, 'Payouts fetched successfully');
});

const triggerPayout = catchAsync(async (req, res) => {
  const { vendorId, periodStart, periodEnd } = req.body;

  const settlement = await vendorFinanceService.createSettlementForVendor(vendorId, {
    periodStart,
    periodEnd,
  });

  if (!settlement) {
    sendResponse(res, 200, { settlement: null }, 'No unsettled transactions found for this vendor');
    return;
  }

  const payout = await prisma.payout.create({
    data: {
      vendor_id: vendorId,
      amount: settlement.net_amount,
      status: 'completed',
      gateway_reference: `MANUAL-PAYOUT-${Date.now()}`,
      payout_date: new Date(),
    },
  });

  await vendorFinanceService.releaseSettlement(settlement.id, payout.gateway_reference);
  await recordAuditEntry({
    vendorId,
    userId: req.user.id,
    action: 'VENDOR_PAYOUT_TRIGGERED',
    entity: 'vendor_settlement',
    entityId: settlement.id,
    details: { periodStart, periodEnd },
  });

  sendResponse(res, 202, { settlement, payout }, 'Payout processed successfully');
});

module.exports = {
  getMyPayouts,
  triggerPayout
};
