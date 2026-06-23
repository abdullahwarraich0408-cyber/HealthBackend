const prisma = require('../../config/database');

const getDashboardStats = async () => {
  const [userCount, vendorCount, orderCount, totalRevenue] = await Promise.all([
    prisma.user.count({ where: { role: 'customer' } }),
    prisma.vendor.count(),
    prisma.order.count(),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { status: 'completed' }
    })
  ]);

  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { created_at: 'desc' },
    include: { customer: { select: { name: true } }, vendor: { select: { business_name: true } } }
  });

  return {
    users: userCount,
    vendors: vendorCount,
    orders: orderCount,
    revenue: totalRevenue._sum.amount || 0,
    recentOrders
  };
};

module.exports = {
  getDashboardStats
};
