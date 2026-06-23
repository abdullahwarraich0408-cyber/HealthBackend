const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const requestReturn = async (customerId, { order_id, reason }) => {
  // Verify order exists
  const order = await prisma.order.findUnique({ where: { id: order_id } });
  if (!order) throw new AppError('Order not found', 404);

  // Verify ownership
  if (order.customer_id !== customerId) {
    throw new AppError('You do not have permission to request a return for this order', 403);
  }

  // Create return request
  return prisma.returnRequest.create({
    data: {
      order_id,
      customer_id: customerId,
      reason,
      status: 'pending'
    }
  });
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

  return prisma.returnRequest.update({
    where: { id: returnId },
    data: {
      status,
      notes: notes || returnRequest.notes
    }
  });
};

const processReturn = async (vendorId, returnId, { refund_amount, notes }) => {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: true }
  });
  if (!returnRequest) throw new AppError('Return request not found', 404);

  // Verify that this return belongs to the vendor's order
  if (returnRequest.order.vendor_id !== vendorId) {
    throw new AppError('You do not have permission to process this return request', 403);
  }

  // Only approved return requests can be processed by the vendor
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
  updateReturnStatus,
  processReturn
};
