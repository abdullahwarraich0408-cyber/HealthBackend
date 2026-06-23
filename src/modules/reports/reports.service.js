const prisma = require('../../config/database');

const generateVendorReport = async (vendorId, startDate, endDate) => {
  const orders = await prisma.order.findMany({
    where: {
      vendor_id: vendorId,
      created_at: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    },
    include: { items: true }
  });

  const totalSales = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const totalOrders = orders.length;

  return {
    vendorId,
    period: { startDate, endDate },
    metrics: { totalSales, totalOrders },
    orders
  };
};

const generateAdminSystemReport = async () => {
  const totalTransactions = await prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'completed' } });
  const totalCommissions = await prisma.commission.aggregate({ _sum: { amount: true } });

  return {
    platformRevenue: totalTransactions._sum.amount || 0,
    platformProfit: totalCommissions._sum.amount || 0
  };
};

module.exports = {
  generateVendorReport,
  generateAdminSystemReport
};
