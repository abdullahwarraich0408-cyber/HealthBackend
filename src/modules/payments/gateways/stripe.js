const Stripe = require('stripe');
const env = require('../../../config/env');

let stripeClient = null;

function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function toMinorUnits(amount, currency) {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  const zeroDecimalCurrencies = new Set(['jpy', 'krw', 'vnd']);
  if (zeroDecimalCurrencies.has(currency)) {
    return Math.round(normalized);
  }

  return Math.round(normalized * 100);
}

/**
 * Create a Stripe Checkout Session (sandbox/test when using sk_test_* keys).
 */
const createCheckoutSession = async ({
  amount,
  productName = 'Medzoos Payment',
  productDescription = 'Healthcare payment',
  metadata = {},
  successUrl,
  cancelUrl,
  returnBaseUrl,
}) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return { success: false, message: 'Stripe is not configured on the server' };
  }

  const currency = (env.STRIPE_CURRENCY || 'pkr').toLowerCase();
  const unitAmount = toMinorUnits(amount, currency);

  if (!unitAmount || unitAmount < 50) {
    return { success: false, message: 'Amount is too low for card payment' };
  }

  const frontendUrl = (returnBaseUrl || env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const success =
    successUrl ||
    `${frontendUrl}/payment/complete?success=true&session_id={CHECKOUT_SESSION_ID}`;
  const cancel =
    cancelUrl || `${frontendUrl}/payment/complete?cancelled=true`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success,
      cancel_url: cancel,
      metadata: {
        ...metadata,
        return_base_url: frontendUrl,
      },
    });

    return {
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'Stripe checkout session could not be created',
    };
  }
};

const retrieveCheckoutSession = async (sessionId) => {
  const stripe = getStripeClient();
  if (!stripe) {
    return null;
  }
  return stripe.checkout.sessions.retrieve(sessionId);
};

module.exports = {
  createCheckoutSession,
  retrieveCheckoutSession,
  getStripeClient,
};
