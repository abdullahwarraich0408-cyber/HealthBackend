const prisma = require('../../config/database');
const { calculateOrderFinancials } = require('../pharmacy/money');

function resolveDateRange(range = 'last_30', customFrom, customTo) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      break;
    case 'last_7':
      start.setDate(start.getDate() - 7);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end.setTime(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1);
      break;
    case 'custom':
      start = customFrom ? new Date(customFrom) : new Date(0);
      end = customTo ? new Date(customTo) : now;
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start, end };
}

async function getSalesReport(vendorId, query = {}) {
  const { start, end } = resolveDateRange(query.range, query.from, query.to);
  const orders = await prisma.order.findMany({
    where: {
      vendor_id: vendorId,
      created_at: { gte: start, lte: end },
    },
    include: {
      items: { include: { product: { select: { name: true, category: true } } } },
      vendor: { select: { commission_rate: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  const valid = orders.filter((order) => !['CANCELLED', 'REJECTED', 'cancelled'].includes(order.status));
  const rows = valid.map((order) => {
    const financials = calculateOrderFinancials({
      subtotal: order.subtotal || order.total_amount,
      discount: order.discount_amount,
      deliveryFee: order.delivery_fee,
      commissionRate: order.commission_amount
        ? (Number(order.commission_amount) / Math.max(Number(order.total_amount) || 1, 1)) * 100
        : order.vendor?.commission_rate,
      refundAmount: order.refund_amount,
    });
    return {
      date: order.created_at,
      order: order.order_number || order.id,
      order_id: order.id,
      gross: financials.gross,
      discount: financials.discount,
      commission: order.commission_amount || financials.commission,
      platform_fee: order.platform_fee || financials.platformFee,
      refund: order.refund_amount || 0,
      net: order.vendor_net || financials.vendorNet,
      status: order.status,
    };
  });

  const kpis = rows.reduce(
    (acc, row) => {
      acc.gross += row.gross;
      acc.net += row.net;
      acc.commission += row.commission;
      acc.platformFees += row.platform_fee;
      acc.refunds += row.refund;
      acc.orders += 1;
      return acc;
    },
    { gross: 0, net: 0, commission: 0, platformFees: 0, refunds: 0, orders: 0 }
  );
  kpis.averageOrderValue = kpis.orders ? kpis.gross / kpis.orders : 0;

  const trendMap = {};
  for (const row of rows) {
    const key = new Date(row.date).toISOString().slice(0, 10);
    if (!trendMap[key]) trendMap[key] = { date: key, revenue: 0, orders: 0 };
    trendMap[key].revenue += row.gross;
    trendMap[key].orders += 1;
  }

  const categoryMap = {};
  const productMap = {};
  const statusMap = {};
  for (const order of valid) {
    statusMap[order.status] = (statusMap[order.status] || 0) + 1;
    for (const item of order.items || []) {
      const category = item.product?.category || 'Other';
      categoryMap[category] = (categoryMap[category] || 0) + Number(item.unit_price || 0) * item.quantity;
      const name = item.product?.name || 'Unknown';
      if (!productMap[name]) productMap[name] = { name, sales: 0, revenue: 0 };
      productMap[name].sales += item.quantity;
      productMap[name].revenue += Number(item.unit_price || 0) * item.quantity;
    }
  }

  return {
    range: { start, end, key: query.range || 'last_30' },
    kpis,
    rows,
    revenueTrend: Object.values(trendMap),
    ordersTrend: Object.values(trendMap),
    salesByCategory: Object.entries(categoryMap).map(([name, value]) => ({ name, value })),
    bestSellers: Object.values(productMap).sort((a, b) => b.sales - a.sales).slice(0, 8),
    statusBreakdown: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
  };
}

async function getPayoutOverview(vendorId) {
  const [summary, payouts] = await Promise.all([
    getVendorEarningsSummary(vendorId),
    prisma.payout.findMany({
      where: { vendor_id: vendorId },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  const totalPaid = payouts
    .filter((payout) => ['PAID', 'completed', 'paid'].includes(payout.status))
    .reduce((sum, payout) => sum + Number(payout.net_amount || payout.amount || 0), 0);

  return {
    available: summary.totals.settled || Math.max(0, summary.totals.net - totalPaid),
    pending: summary.totals.pending,
    totalPaid,
    nextPayout: payouts.find((payout) => ['PENDING', 'pending', 'PROCESSING'].includes(payout.status)) || null,
    payouts,
    ledger: summary.recentTransactions,
  };
}

async function getVendorEarningsSummary(vendorId) {
  const [transactions, settlements] = await Promise.all([
    prisma.vendorTransaction.findMany({
      where: { vendor_id: vendorId },
      orderBy: { created_at: 'desc' },
    }),
    prisma.vendorSettlement.findMany({
      where: { vendor_id: vendorId },
      orderBy: { created_at: 'desc' },
      take: 12,
    }),
  ]);

  const totals = transactions.reduce(
    (acc, transaction) => {
      acc.gross += Number(transaction.gross_amount || 0);
      acc.commission += Number(transaction.commission_amount || 0);
      acc.net += Number(transaction.net_amount || 0);
      if (transaction.status === 'pending') acc.pending += Number(transaction.net_amount || 0);
      if (transaction.status === 'settled') acc.settled += Number(transaction.net_amount || 0);
      return acc;
    },
    { gross: 0, commission: 0, net: 0, pending: 0, settled: 0 }
  );

  return {
    totals,
    recentTransactions: transactions.slice(0, 10),
    recentSettlements: settlements,
  };
}

async function listVendorSettlements(vendorId) {
  return prisma.vendorSettlement.findMany({
    where: { vendor_id: vendorId },
    orderBy: { created_at: 'desc' },
  });
}

async function listAdminSettlements() {
  return prisma.vendorSettlement.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      vendor: {
        select: {
          id: true,
          business_name: true,
          email: true,
        },
      },
    },
  });
}

async function releaseSettlement(settlementId, reference) {
  const settlement = await prisma.vendorSettlement.update({
    where: { id: settlementId },
    data: {
      status: 'released',
      released_at: new Date(),
      reference: reference || undefined,
    },
  });

  await prisma.vendorTransaction.updateMany({
    where: { settlement_id: settlementId },
    data: { status: 'settled' },
  });

  await prisma.commission.updateMany({
    where: { settlement_id: settlementId },
    data: { status: 'settled' },
  });

  return settlement;
}

async function createSettlementForVendor(vendorId, { periodStart, periodEnd }) {
  const start = periodStart ? new Date(periodStart) : new Date(0);
  const end = periodEnd ? new Date(periodEnd) : new Date();

  const unsettledTransactions = await prisma.vendorTransaction.findMany({
    where: {
      vendor_id: vendorId,
      settlement_id: null,
      status: { in: ['completed', 'pending'] },
      created_at: { gte: start, lte: end },
    },
  });

  if (!unsettledTransactions.length) {
    return null;
  }

  const totals = unsettledTransactions.reduce(
    (acc, transaction) => {
      acc.gross += Number(transaction.gross_amount || 0);
      acc.commission += Number(transaction.commission_amount || 0);
      acc.net += Number(transaction.net_amount || 0);
      return acc;
    },
    { gross: 0, commission: 0, net: 0 }
  );

  const settlement = await prisma.vendorSettlement.create({
    data: {
      vendor_id: vendorId,
      period_start: start,
      period_end: end,
      status: 'pending',
      gross_amount: totals.gross,
      commission_amount: totals.commission,
      net_amount: totals.net,
    },
  });

  await prisma.vendorTransaction.updateMany({
    where: {
      id: { in: unsettledTransactions.map((transaction) => transaction.id) },
    },
    data: {
      settlement_id: settlement.id,
      status: 'pending_settlement',
    },
  });

  await prisma.commission.updateMany({
    where: {
      vendor_id: vendorId,
      settlement_id: null,
      created_at: { gte: start, lte: end },
    },
    data: {
      settlement_id: settlement.id,
      status: 'pending_settlement',
    },
  });

  return settlement;
}

module.exports = {
  createSettlementForVendor,
  getVendorEarningsSummary,
  getSalesReport,
  getPayoutOverview,
  listAdminSettlements,
  listVendorSettlements,
  releaseSettlement,
};
