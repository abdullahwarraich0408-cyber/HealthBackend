const { orderQueue } = require('../../queues');
const { ACCEPT_TIMEOUT_SEC } = require('./vendor-assignment.service');

const localTimeouts = new Map();

async function scheduleAcceptTimeout(orderId) {
  clearAcceptTimeout(orderId);

  const delayMs = ACCEPT_TIMEOUT_SEC * 1000;
  const job = await orderQueue.add(
    'prescription-accept-timeout',
    { orderId },
    { delay: delayMs, jobId: `prescription-timeout-${orderId}`, removeOnComplete: true }
  );

  if (String(job.id).startsWith('dev-')) {
    const timer = setTimeout(async () => {
      localTimeouts.delete(orderId);
      try {
        const service = require('./prescription-orders.service');
        await service.handleAcceptTimeout(orderId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Prescription accept timeout failed:', error.message);
      }
    }, delayMs);
    localTimeouts.set(orderId, timer);
  }
}

function clearAcceptTimeout(orderId) {
  const timer = localTimeouts.get(orderId);
  if (timer) {
    clearTimeout(timer);
    localTimeouts.delete(orderId);
  }
}

module.exports = {
  scheduleAcceptTimeout,
  clearAcceptTimeout,
};
