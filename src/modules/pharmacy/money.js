const DEFAULT_PLATFORM_FEE_RATE = Number(process.env.VENDOR_PLATFORM_FEE_RATE || 0);

function toMoney(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatPkr(value) {
  return `PKR ${toMoney(value).toLocaleString('en-PK')}`;
}

function calculateOrderFinancials({
  subtotal = 0,
  discount = 0,
  deliveryFee = 0,
  commissionRate = 0,
  platformFeeRate = DEFAULT_PLATFORM_FEE_RATE,
  refundAmount = 0,
  adjustment = 0,
} = {}) {
  const safeSubtotal = toMoney(subtotal);
  const safeDiscount = toMoney(discount);
  const safeDelivery = toMoney(deliveryFee);
  const gross = toMoney(Math.max(0, safeSubtotal - safeDiscount + safeDelivery));
  const commission = toMoney((gross * Number(commissionRate || 0)) / 100);
  const platformFee = toMoney((gross * Number(platformFeeRate || 0)) / 100);
  const refund = toMoney(refundAmount);
  const adj = toMoney(adjustment);
  const vendorNet = toMoney(gross - commission - platformFee - refund + adj);

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    deliveryFee: safeDelivery,
    gross,
    commission,
    platformFee,
    refund,
    adjustment: adj,
    vendorNet,
    commissionRate: Number(commissionRate || 0),
    platformFeeRate: Number(platformFeeRate || 0),
  };
}

function sumLedger(transactions = []) {
  return transactions.reduce(
    (acc, entry) => {
      const type = String(entry.type || '').toUpperCase();
      const gross = toMoney(entry.gross_amount);
      const commission = toMoney(entry.commission_amount);
      const net = toMoney(entry.net_amount);
      acc.gross += gross;
      acc.commission += commission;
      acc.net += net;
      if (type.includes('REFUND')) acc.refunds += Math.abs(net);
      if (type.includes('FEE') || type.includes('PLATFORM')) acc.fees += Math.abs(commission || net);
      if (String(entry.status) === 'pending') acc.pending += net;
      if (['settled', 'completed', 'paid'].includes(String(entry.status))) acc.settled += net;
      return acc;
    },
    { gross: 0, commission: 0, net: 0, refunds: 0, fees: 0, pending: 0, settled: 0 }
  );
}

module.exports = {
  DEFAULT_PLATFORM_FEE_RATE,
  toMoney,
  formatPkr,
  calculateOrderFinancials,
  sumLedger,
};
