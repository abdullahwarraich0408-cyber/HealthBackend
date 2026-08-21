const { orderQueue } = require('../../queues');

const localTimeouts = new Map();

/**
 * Schedule quotation expiry (customer must pay / confirm before expiresAt).
 * @param {string} orderId
 * @param {Date|string|number} expiresAt
 */
async function scheduleQuotationExpiry(orderId, expiresAt) {
  clearQuotationExpiry(orderId);

  const when = new Date(expiresAt).getTime();
  const delayMs = Math.max(0, when - Date.now());

  const job = await orderQueue.add(
    'prescription-quotation-expiry',
    { orderId },
    {
      delay: delayMs,
      jobId: `prescription-quotation-expiry-${orderId}`,
      removeOnComplete: true,
    }
  );

  if (String(job.id).startsWith('dev-')) {
    const timer = setTimeout(async () => {
      localTimeouts.delete(orderId);
      try {
        const service = require('./prescription-orders.service');
        await service.expireQuotation(orderId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Prescription quotation expiry failed:', error.message);
      }
    }, delayMs);
    localTimeouts.set(orderId, timer);
  }
}

function clearQuotationExpiry(orderId) {
  const timer = localTimeouts.get(orderId);
  if (timer) {
    clearTimeout(timer);
    localTimeouts.delete(orderId);
  }
}

module.exports = {
  scheduleQuotationExpiry,
  clearQuotationExpiry,
};
