const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const bankalfallah = require('./gateways/bankalfallah');
const stripeGateway = require('./gateways/stripe');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');

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
  await prisma.transaction.create({
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

  const orderIds = transaction.order_transactions.map((entry) => entry.order_id);

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { vendor: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'completed', gateway_reference: transactionReference },
    });

    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: 'processing' },
    });

    for (const order of orders) {
      const commissionRate = Number(order.vendor?.commission_rate || 0);
      const commissionAmount = (Number(order.total_amount || 0) * commissionRate) / 100;

      await tx.commission.create({
        data: {
          order_id: order.id,
          vendor_id: order.vendor_id,
          amount: commissionAmount,
          rate_applied: commissionRate,
          status: 'pending_settlement',
        },
      });

      await tx.vendorTransaction.create({
        data: {
          vendor_id: order.vendor_id,
          order_id: order.id,
          type: 'order_payment',
          status: 'completed',
          gross_amount: Number(order.total_amount || 0),
          commission_amount: commissionAmount,
          net_amount: Number(order.total_amount || 0) - commissionAmount,
          reference: transactionReference,
          meta: {
            transaction_id: transaction.id,
            checkout_session_id: sessionId,
          },
        },
      });
    }
  });

  for (const order of orders) {
    await vendorNotificationsService.createVendorNotification({
      vendorId: order.vendor_id,
      type: 'payment_captured',
      title: 'Payment captured',
      message: `Payment has been captured for order ${order.id.slice(0, 8)}.`,
      data: {
        orderId: order.id,
        amount: order.total_amount,
      },
    });

    await recordAuditEntry({
      vendorId: order.vendor_id,
      userId: null,
      action: 'ORDER_PAYMENT_CAPTURED',
      entity: 'order',
      entityId: order.id,
      details: {
        transaction_reference: transactionReference,
        amount: order.total_amount,
      },
    });
  }
};

const processFailedPayment = async (sessionId, transactionReference) => {
  const transaction = await prisma.transaction.findFirst({
    where: { gateway_reference: sessionId, status: 'pending' },
    include: {
      order_transactions: {
        include: {
          order: {
            include: {
              items: true,
            },
          },
        },
      },
    },
  });

  if (!transaction) return;

  const orderIds = transaction.order_transactions.map((entry) => entry.order_id);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'failed', gateway_reference: transactionReference },
    });

    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: 'cancelled' },
    });

    for (const entry of transaction.order_transactions) {
      const order = entry.order;
      if (!order) continue;

      for (const item of order.items || []) {
        await tx.product.update({
          where: { id: item.product_id },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      await tx.inventoryReservation.updateMany({
        where: { order_id: order.id },
        data: {
          status: 'released',
          released_at: new Date(),
        },
      });
    }
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
