const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const bankalfallah = require('./gateways/bankalfallah');
const stripeGateway = require('./gateways/stripe');
const { paymentQueue } = require('../../queues');

const createPaymentSession = async (orderIds, totalAmount, customerId, paymentMethod = 'stripe', frontendUrl) => {
  // Validate that orders exist and belong to the customer
  const orders = await prisma.order.findMany({
    where: { 
      id: { in: orderIds },
      customer_id: customerId,
      status: 'pending'
    }
  });

  if (orders.length !== orderIds.length) {
    throw new AppError('One or more orders are invalid or not in pending state', 400);
  }

  const calculatedTotal = orders.reduce((sum, order) => sum + order.total_amount, 0);

  if (totalAmount && Math.abs(calculatedTotal - totalAmount) > 1) {
    throw new AppError(
      `Total amount mismatch. Expected ${calculatedTotal.toFixed(2)}, received ${Number(totalAmount).toFixed(2)}`,
      400
    );
  }

  let paymentRes;
  if (paymentMethod === 'stripe') {
    paymentRes = await stripeGateway.createCheckoutSession(calculatedTotal, orderIds, frontendUrl);
    if (!paymentRes.success) {
      throw new AppError(paymentRes.message || 'Failed to initiate Stripe checkout', 502);
    }
  } else {
    paymentRes = await bankalfallah.initiateCheckout(calculatedTotal, orderIds);
    if (!paymentRes.success) {
      throw new AppError('Failed to initiate payment with Bank Alfallah', 500);
    }
  }

  // Record transaction as pending
  const transaction = await prisma.transaction.create({
    data: {
      amount: calculatedTotal,
      type: 'payment',
      gateway_reference: paymentRes.sessionId,
      status: 'pending',
      order_transactions: {
        create: orders.map((order) => ({ order_id: order.id })),
      },
    },
  });

  // Update orders with the session ID
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { checkout_session_id: paymentRes.sessionId }
  });

  return paymentRes;
};

const processSuccessfulPayment = async (sessionId, transactionReference) => {
  const transaction = await prisma.transaction.findFirst({
    where: { gateway_reference: sessionId, status: 'pending' },
    include: { order_transactions: true },
  });

  if (!transaction) return;

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { status: 'completed', gateway_reference: transactionReference },
  });

  const orderIds = transaction.order_transactions.map((entry) => entry.order_id);
  
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { status: 'processing' } // Based on your business logic
  });

  // 4. Trigger commission calculations in background
  for (const orderId of orderIds) {
    try {
      await paymentQueue.add('calculate-commission', { orderId });
    } catch {
      // Payment should succeed even if background queue is unavailable
    }
  }
};

const processFailedPayment = async (sessionId, transactionReference) => {
  const transaction = await prisma.transaction.findFirst({
    where: { gateway_reference: sessionId, status: 'pending' },
    include: { order_transactions: true },
  });

  if (!transaction) return;

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { status: 'failed', gateway_reference: transactionReference },
  });

  const orderIds = transaction.order_transactions.map((entry) => entry.order_id);
  
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { status: 'cancelled' } 
  });
};

const verifyStripeSession = async (sessionId, customerId) => {
  if (!sessionId) {
    throw new AppError('Stripe session ID is required', 400);
  }

  const session = await stripeGateway.retrieveCheckoutSession(sessionId);
  if (!session) {
    throw new AppError('Stripe session not found', 404);
  }

  const orderIds = (session.metadata?.order_ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!orderIds.length) {
    throw new AppError('No orders linked to this payment session', 400);
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      customer_id: customerId,
    },
  });

  if (orders.length !== orderIds.length) {
    throw new AppError('Unauthorized payment verification', 403);
  }

  if (session.payment_status === 'paid') {
    await processSuccessfulPayment(session.id, session.payment_intent || session.id);
    return {
      paid: true,
      orderIds,
      sessionId: session.id,
    };
  }

  return {
    paid: false,
    orderIds,
    sessionId: session.id,
    status: session.payment_status,
  };
};

module.exports = {
  createPaymentSession,
  processSuccessfulPayment,
  processFailedPayment,
  verifyStripeSession,
};
