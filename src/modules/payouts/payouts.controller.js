const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const { sendResponse } = require('../../utils/response');
const { payoutQueue } = require('../../queues');

const getMyPayouts = catchAsync(async (req, res) => {
  const payouts = await prisma.payout.findMany({
    where: { vendor_id: req.user.id },
    orderBy: { created_at: 'desc' }
  });
  sendResponse(res, 200, { payouts }, 'Payouts fetched successfully');
});

const triggerPayout = catchAsync(async (req, res) => {
  const { vendorId } = req.body;
  
  // Push to BullMQ queue to be handled asynchronously
  await payoutQueue.add('manual-payout', { vendorId });

  sendResponse(res, 202, null, 'Payout job added to queue');
});

module.exports = {
  getMyPayouts,
  triggerPayout
};
