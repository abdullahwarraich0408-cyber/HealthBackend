const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { hashPassword } = require('../auth/auth.helper');

const registerVendor = async (data) => {
  const existingVendor = await prisma.vendor.findUnique({ where: { email: data.email } });
  if (existingVendor) {
    throw new AppError('Email already in use by another vendor', 400);
  }

  const hashedPassword = await hashPassword(data.password);
  
  const vendor = await prisma.vendor.create({
    data: {
      ...data,
      password: hashedPassword
    }
  });

  return vendor;
};

const getVendorProfile = async (vendorId) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      email: true,
      business_name: true,
      license_number: true,
      status: true,
      commission_rate: true,
      trade_license_url: true,
      pharmacist_certificate_url: true,
      created_at: true,
      updated_at: true
    }
  });

  if (!vendor) {
    throw new AppError('Vendor not found', 404);
  }

  return vendor;
};

const updateVendorProfile = async (vendorId, data) => {
  const updateData = { ...data };
  if (updateData.password) {
    updateData.password = await hashPassword(updateData.password);
  } else {
    delete updateData.password;
  }

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: updateData,
    select: {
      id: true,
      email: true,
      business_name: true,
      license_number: true,
      status: true,
      commission_rate: true,
      trade_license_url: true,
      pharmacist_certificate_url: true,
      created_at: true,
      updated_at: true
    }
  });

  return vendor;
};

const getVendors = async (query) => {
  // Add pagination and filtering here
  // Security fix: Public route MUST only return approved vendors
  
  const vendors = await prisma.vendor.findMany({
    where: { status: 'approved' },
    select: {
      id: true,
      business_name: true,
      email: true,
      license_number: true,
      status: true,
      created_at: true,
      _count: { select: { products: true } }
    }
  });

  return vendors.map(({ _count, ...vendor }) => ({
    ...vendor,
    product_count: _count.products
  }));
};

const getMyProducts = async (vendorId) => {
  return prisma.product.findMany({
    where: { vendor_id: vendorId },
    orderBy: { name: 'asc' },
  });
};

const getDashboardStats = async (vendorId) => {
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: { vendor_id: vendorId },
      include: {
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
        customer: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.product.findMany({ where: { vendor_id: vendorId } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const ordersToday = orders.filter((order) => new Date(order.created_at) >= today).length;
  const activeProducts = products.length;
  const lowStock = products.filter((product) => product.stock <= 10).length;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap = {};
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyMap[key] = { name: monthNames[date.getMonth()], revenue: 0, orders: 0 };
  }

  for (const order of orders) {
    const created = new Date(order.created_at);
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    if (monthlyMap[key]) {
      monthlyMap[key].revenue += order.total_amount || 0;
      monthlyMap[key].orders += 1;
    }
  }

  const productSales = {};
  for (const order of orders) {
    for (const item of order.items || []) {
      const name = item.product?.name || 'Unknown';
      if (!productSales[name]) {
        productSales[name] = { name, sales: 0, revenue: 0 };
      }
      productSales[name].sales += item.quantity;
      productSales[name].revenue += (item.unit_price || 0) * item.quantity;
    }
  }

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map((product, index) => ({
      ...product,
      rank: index + 1,
    }));

  const pendingOrders = orders.filter((order) => order.status === 'pending').length;
  const processingOrders = orders.filter((order) => order.status === 'processing' || order.status === 'shipped').length;
  const completedToday = orders.filter(
    (order) => order.status === 'delivered' && new Date(order.updated_at) >= today
  ).length;

  return {
    totalRevenue,
    ordersToday,
    activeProducts,
    lowStock,
    totalOrders: orders.length,
    monthlyPerformance: Object.values(monthlyMap),
    topProducts,
    recentOrders: orders.slice(0, 5).map((order) => ({
      id: order.id,
      customer: order.customer?.name || 'Customer',
      items: order.items?.length || 0,
      status: order.status,
      amount: order.total_amount,
    })),
    orderSummary: {
      pending: pendingOrders,
      outForDelivery: processingOrders,
      completedToday,
    },
  };
};

module.exports = {
  registerVendor,
  getVendorProfile,
  updateVendorProfile,
  getVendors,
  getMyProducts,
  getDashboardStats,
};
