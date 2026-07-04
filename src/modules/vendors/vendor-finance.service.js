const prisma = require('../../config/database');

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
  listAdminSettlements,
  listVendorSettlements,
  releaseSettlement,
};
