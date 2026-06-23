const catchAsync = require('../../utils/catchAsync');
const paymentsService = require('./payments.service');
const { sendResponse } = require('../../utils/response');

const checkout = catchAsync(async (req, res) => {
  const { order_ids, total_amount, payment_method = 'stripe', frontend_url } = req.body;
  
  const paymentSession = await paymentsService.createPaymentSession(
    order_ids,
    total_amount,
    req.user.id,
    payment_method,
    frontend_url
  );
  
  sendResponse(res, 200, { 
    checkoutUrl: paymentSession.checkoutUrl,
    sessionId: paymentSession.sessionId 
  }, 'Checkout initiated successfully');
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
