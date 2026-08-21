const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const inboxEvents = require('../notifications/inbox.events');

const requestReturn = async (customerId, { order_id, reason }) => {
  // Verify order exists
  const order = await prisma.order.findUnique({ where: { id: order_id } });
  if (!order) throw new AppError('Order not found', 404);

  // Verify ownership
  if (order.customer_id !== customerId) {
    throw new AppError('You do not have permission to request a return for this order', 403);
  }

  // Create return request
  const returnRequest = await prisma.returnRequest.create({
    data: {
      order_id,
      customer_id: customerId,
      reason,
      status: 'pending'
    }
  });

  await inboxEvents.returnRequested(returnRequest, order);
  return returnRequest;
};

const getCustomerReturns = async (customerId) => {
  return prisma.returnRequest.findMany({
    where: { customer_id: customerId },
    include: {
      order: {
        select: {
          total_amount: true,
          status: true,
          created_at: true
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });
};

const updateReturnStatus = async (adminId, returnId, { status, notes }) => {
  if (status !== 'approved' && status !== 'rejected') {
    throw new AppError('Status must be either approved or rejected', 400);
  }

  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnId }
  });
  if (!returnRequest) throw new AppError('Return request not found', 404);

  const updated = await prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      status,
      notes: notes || returnRequest.notes
    }
  });

  await inboxEvents.returnResolved(updated, status);
  return updated;
};

const getVendorReturns = async (vendorId) => {
  return prisma.returnRequest.findMany({
    where: { order: { vendor_id: vendorId } },
    include: {
      order: {
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          status: true,
          created_at: true,
          vendor_id: true,
        },
      },
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { created_at: 'desc' },
  });
};

const updateVendorReturn = async (vendorId, returnId, { status, notes, refund_amount }) => {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: true },
  });
  if (!returnRequest) throw new AppError('Return request not found', 404);
  if (returnRequest.order.vendor_id !== vendorId) {
    throw new AppError('You do not have permission to process this return request', 403);
  }

  const nextStatus = String(status || '').toLowerCase();
  const allowed = ['requested', 'pending', 'under_review', 'approved', 'rejected', 'received', 'refunded', 'processed', 'closed'];
  if (status && !allowed.includes(nextStatus)) {
    throw new AppError('Invalid return status', 400);
  }

  const updated = await prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      ...(status ? { status: nextStatus } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(refund_amount !== undefined ? { refund_amount } : {}),
    },
  });

  await inboxEvents.returnResolved(updated, updated.status);
  return updated;
};

const processReturn = async (vendorId, returnId, { refund_amount, notes }) => {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: true }
  });
  if (!returnRequest) throw new AppError('Return request not found', 404);

  if (returnRequest.order.vendor_id !== vendorId) {
    throw new AppError('You do not have permission to process this return request', 403);
  }

  if (returnRequest.status !== 'approved') {
    throw new AppError('Only approved return requests can be processed', 400);
  }

  if (refund_amount < 0 || refund_amount > returnRequest.order.total_amount) {
    throw new AppError(`Refund amount must be between 0 and Rs. ${returnRequest.order.total_amount}`, 400);
  }

  return prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      status: 'processed',
      refund_amount,
      notes: notes || returnRequest.notes
    }
  });
};

module.exports = {
  requestReturn,
  getCustomerReturns,
  getVendorReturns,
  updateVendorReturn,
  updateReturnStatus,
  processReturn
};
