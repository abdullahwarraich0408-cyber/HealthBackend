const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const bankalfallah = require('./gateways/bankalfallah');
const stripeGateway = require('./gateways/stripe');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');

const ONLINE_METHODS = new Set(['stripe', 'card', 'online']);

function isOnlinePaymentMethod(method) {
  return ONLINE_METHODS.has(String(method || '').toLowerCase());
}

function frontendBase(url) {
  return (url || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Medicine orders — Stripe Checkout
 */
const createPaymentSession = async (
  orderIds,
  totalAmount,
  customerId,
  paymentMethod = 'stripe',
  frontendUrl
) => {
  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      customer_id: customerId,
      payment_status: { in: ['unpaid', 'pending'] },
      status: { in: ['pending', 'NEW', 'awaiting_payment'] },
    },
  });

  if (orders.length !== orderIds.length) {
    throw new AppError('One or more orders are invalid or not awaiting payment', 400);
  }

  const calculatedTotal = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  if (totalAmount && Math.abs(calculatedTotal - Number(totalAmount)) > 1) {
    throw new AppError(
      `Total amount mismatch. Expected ${calculatedTotal.toFixed(2)}, received ${Number(totalAmount).toFixed(2)}`,
      400
    );
  }

  const base = frontendBase(frontendUrl);
  let paymentRes;

  if (paymentMethod === 'stripe' || paymentMethod === 'card') {
    paymentRes = await stripeGateway.createCheckoutSession({
      amount: calculatedTotal,
      productName: 'Medzoos Medicine Order',
      productDescription: `Payment for ${orderIds.length} order(s)`,
      metadata: {
        purpose: 'order',
        order_ids: orderIds.join(','),
        customer_id: customerId,
      },
      successUrl: `${base}/checkout?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/checkout?cancelled=true`,
      returnBaseUrl: base,
    });
    if (!paymentRes.success) {
      throw new AppError(paymentRes.message || 'Failed to initiate Stripe checkout', 502);
    }
  } else {
    paymentRes = await bankalfallah.initiateCheckout(calculatedTotal, orderIds);
    if (!paymentRes.success) {
      throw new AppError('Failed to initiate payment with Bank Alfallah', 500);
    }
  }

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

  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { checkout_session_id: paymentRes.sessionId },
  });

  return paymentRes;
};

/**
 * Doctor appointment — Stripe Checkout
 */
const createAppointmentPaymentSession = async (appointmentId, customerId, frontendUrl) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, customer_id: customerId },
    include: { doctor: { include: { account: true } } },
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  if (appointment.payment_status === 'paid') {
    throw new AppError('Appointment is already paid', 400);
  }

  if (!isOnlinePaymentMethod(appointment.payment_method)) {
    throw new AppError('This appointment is not set up for online payment', 400);
  }

  const amount = Number(appointment.fee || 0);
  if (amount <= 0) {
    throw new AppError('Invalid appointment fee', 400);
  }

  const base = frontendBase(frontendUrl);
  const doctorName = appointment.doctor?.account?.name || 'Doctor';

  const paymentRes = await stripeGateway.createCheckoutSession({
    amount,
    productName: 'Doctor Appointment',
    productDescription: `Consultation with ${doctorName} · ${appointment.slot}`,
    metadata: {
      purpose: 'appointment',
      appointment_id: appointment.id,
      customer_id: customerId,
    },
    successUrl: `${base}/account/appointments?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/account/appointments?payment=cancelled`,
    returnBaseUrl: base,
  });

  if (!paymentRes.success) {
    throw new AppError(paymentRes.message || 'Failed to initiate Stripe checkout', 502);
  }

  await prisma.transaction.create({
    data: {
      amount,
      type: 'payment',
      gateway_reference: paymentRes.sessionId,
      status: 'pending',
    },
  });

  return paymentRes;
};

/**
 * Lab booking(s) — Stripe Checkout (single or group via order_group_id)
 */
const createLabPaymentSession = async ({ bookingIds, orderGroupId, customerId, frontendUrl }) => {
  let bookings = [];

  if (orderGroupId) {
    bookings = await prisma.labTestBooking.findMany({
      where: { order_group_id: orderGroupId, customer_id: customerId },
      include: { lab_test: true },
    });
  } else if (bookingIds?.length) {
    bookings = await prisma.labTestBooking.findMany({
      where: { id: { in: bookingIds }, customer_id: customerId },
      include: { lab_test: true },
    });
  }

  if (!bookings.length) {
    throw new AppError('Lab booking(s) not found', 404);
  }

  if (bookings.some((b) => b.payment_status === 'paid')) {
    throw new AppError('One or more lab bookings are already paid', 400);
  }

  if (bookings.some((b) => !isOnlinePaymentMethod(b.payment_method))) {
    throw new AppError('These bookings are not set up for online payment', 400);
  }

  const amount = bookings.reduce((sum, b) => sum + Number(b.price || 0), 0);
  if (amount <= 0) {
    throw new AppError('Invalid lab booking total', 400);
  }

  const ids = bookings.map((b) => b.id);
  const base = frontendBase(frontendUrl);

  const paymentRes = await stripeGateway.createCheckoutSession({
    amount,
    productName: 'Lab Test Booking',
    productDescription:
      bookings.length === 1
        ? bookings[0].lab_test?.name || 'Lab test'
        : `${bookings.length} lab tests`,
    metadata: {
      purpose: 'lab',
      booking_ids: ids.join(','),
      order_group_id: orderGroupId || '',
      customer_id: customerId,
    },
    successUrl: `${base}/payment/complete?purpose=lab&success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/lab-tests/cart?payment=cancelled`,
    returnBaseUrl: base,
  });

  if (!paymentRes.success) {
    throw new AppError(paymentRes.message || 'Failed to initiate Stripe checkout', 502);
  }

  await prisma.transaction.create({
    data: {
      amount,
      type: 'payment',
      gateway_reference: paymentRes.sessionId,
      status: 'pending',
    },
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
  if (!orderIds.length) return;

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
      data: {
        status: 'NEW',
        payment_status: 'paid',
      },
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

    if (orderIds.length) {
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: 'cancelled', payment_status: 'failed' },
      });
    }

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

async function markAppointmentPaid(appointmentId, sessionId, customerId) {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, customer_id: customerId },
  });
  if (!appointment) {
    throw new AppError('Appointment not found', 404);
  }

  await prisma.doctorAppointment.update({
    where: { id: appointmentId },
    data: { payment_status: 'paid', payment_method: 'stripe' },
  });

  await prisma.transaction.updateMany({
    where: { gateway_reference: sessionId, status: 'pending' },
    data: { status: 'completed' },
  });

  return { appointmentId };
}

async function markLabBookingsPaid(bookingIds, sessionId, customerId) {
  const bookings = await prisma.labTestBooking.findMany({
    where: { id: { in: bookingIds }, customer_id: customerId },
  });
  if (bookings.length !== bookingIds.length) {
    throw new AppError('Unauthorized lab payment verification', 403);
  }

  await prisma.labTestBooking.updateMany({
    where: { id: { in: bookingIds } },
    data: {
      payment_status: 'paid',
      payment_method: 'stripe',
      status: 'confirmed',
    },
  });

  await prisma.transaction.updateMany({
    where: { gateway_reference: sessionId, status: 'pending' },
    data: { status: 'completed' },
  });

  return { bookingIds };
}

const verifyStripeSession = async (sessionId, customerId) => {
  if (!sessionId) {
    throw new AppError('Stripe session ID is required', 400);
  }

  const session = await stripeGateway.retrieveCheckoutSession(sessionId);
  if (!session) {
    throw new AppError('Stripe session not found', 404);
  }

  const purpose = session.metadata?.purpose || 'order';
  const paid = session.payment_status === 'paid';

  if (!paid) {
    return {
      paid: false,
      purpose,
      sessionId: session.id,
      status: session.payment_status,
    };
  }

  if (purpose === 'appointment') {
    const appointmentId = session.metadata?.appointment_id;
    if (!appointmentId) {
      throw new AppError('No appointment linked to this payment session', 400);
    }
    await markAppointmentPaid(appointmentId, session.id, customerId);
    return {
      paid: true,
      purpose,
      appointmentId,
      sessionId: session.id,
    };
  }

  if (purpose === 'lab') {
    const bookingIds = (session.metadata?.booking_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!bookingIds.length) {
      throw new AppError('No lab bookings linked to this payment session', 400);
    }
    await markLabBookingsPaid(bookingIds, session.id, customerId);
    return {
      paid: true,
      purpose,
      bookingIds,
      sessionId: session.id,
    };
  }

  // Default: medicine orders
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

  await processSuccessfulPayment(session.id, session.payment_intent || session.id);
  return {
    paid: true,
    purpose: 'order',
    orderIds,
    sessionId: session.id,
  };
};

module.exports = {
  createPaymentSession,
  createAppointmentPaymentSession,
  createLabPaymentSession,
  processSuccessfulPayment,
  processFailedPayment,
  verifyStripeSession,
  isOnlinePaymentMethod,
};
