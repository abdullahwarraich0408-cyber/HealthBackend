const paymentsService = require('../payments.service');
const bankalfallah = require('../gateways/bankalfallah');
const { logger } = require('../../../utils/logger');

const handleBankAlfalahWebhook = async (req, res) => {
  try {
    logger.info("Bank Alfallah Webhook received", req.body);
    
    // In a real scenario, you'd verify a hash from the headers
    const signature = req.headers['x-alfa-signature'];
    
    if (!bankalfallah.verifySignature(req.body, signature)) {
      logger.warn("Invalid webhook signature from Bank Alfallah");
      return res.status(400).send('Invalid signature');
    }

    // Extract transaction details
    const { session_id, status, transaction_reference } = req.body;
    
    if (status === 'SUCCESS') {
      await paymentsService.processSuccessfulPayment(session_id, transaction_reference);
    } else {
      await paymentsService.processFailedPayment(session_id, transaction_reference);
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error(`Webhook Processing Error: ${error.message}`);
    res.status(500).send('Webhook processing failed');
  }
};

module.exports = handleBankAlfalahWebhook;
