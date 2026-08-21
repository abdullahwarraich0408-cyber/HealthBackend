const catchAsync = require('../../utils/catchAsync');
const paymentsService = require('./payments.service');
const { sendResponse } = require('../../utils/response');

const checkout = catchAsync(async (req, res) => {
  const {
    purpose = 'order',
    order_ids,
    total_amount,
    appointment_id,
    booking_ids,
    order_group_id,
    payment_method = 'stripe',
    frontend_url,
  } = req.body;

  let paymentSession;

  if (purpose === 'appointment') {
    paymentSession = await paymentsService.createAppointmentPaymentSession(
      appointment_id,
      req.user.id,
      frontend_url
    );
  } else if (purpose === 'lab') {
    paymentSession = await paymentsService.createLabPaymentSession({
      bookingIds: booking_ids,
      orderGroupId: order_group_id,
      customerId: req.user.id,
      frontendUrl: frontend_url,
    });
  } else {
    paymentSession = await paymentsService.createPaymentSession(
      order_ids,
      total_amount,
      req.user.id,
      payment_method,
      frontend_url
    );
  }

  sendResponse(
    res,
    200,
    {
      checkoutUrl: paymentSession.checkoutUrl,
      sessionId: paymentSession.sessionId,
      purpose,
    },
    'Checkout initiated successfully'
  );
});

const verifyStripeSession = catchAsync(async (req, res) => {
  const { session_id } = req.query;
  const result = await paymentsService.verifyStripeSession(session_id, req.user.id);
  sendResponse(res, 200, result, 'Payment verified successfully');
});

module.exports = {
  checkout,
  verifyStripeSession,
};
