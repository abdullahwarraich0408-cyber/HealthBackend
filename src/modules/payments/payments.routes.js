const express = require('express');
const router = express.Router();
const paymentsController = require('./payments.controller');
const paymentsValidator = require('./payments.validator');
const bankAlfalahWebhook = require('./webhooks/bankalfallah.webhook');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');

// Checkout route (protected)
router.post('/checkout', protect, validate(paymentsValidator.checkoutSchema), paymentsController.checkout);
router.get('/stripe/verify', protect, paymentsController.verifyStripeSession);

// Webhook endpoint does not need protect middleware
// This URL will be registered with Bank Alfalah
router.post('/webhook/bank-alfallah', bankAlfalahWebhook);

module.exports = router;
