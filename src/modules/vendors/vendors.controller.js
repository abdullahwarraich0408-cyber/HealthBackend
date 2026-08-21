const catchAsync = require('../../utils/catchAsync');
const vendorsService = require('./vendors.service');
const { sendResponse } = require('../../utils/response');

const register = catchAsync(async (req, res) => {
  const vendor = await vendorsService.registerVendor(req.body);
  sendResponse(res, 201, { vendor }, 'Vendor registered successfully. Pending approval.');
});

const getProfile = catchAsync(async (req, res) => {
  const vendor = await vendorsService.getVendorProfile(req.user.id);
  sendResponse(res, 200, { vendor }, 'Vendor profile fetched successfully');
});

const updateProfile = catchAsync(async (req, res) => {
  const vendor = await vendorsService.updateVendorProfile(req.user.id, req.body);
  sendResponse(res, 200, { vendor }, 'Vendor profile updated successfully');
});

const getAllVendors = catchAsync(async (req, res) => {
  const vendors = await vendorsService.getVendors(req.query);
  sendResponse(res, 200, { vendors }, 'Vendors fetched successfully');
});

const getMyProducts = catchAsync(async (req, res) => {
  const result = await vendorsService.getMyProducts(req.user.id, req.query);
  if (Array.isArray(result)) {
    sendResponse(res, 200, { products: result }, 'Vendor products fetched successfully');
    return;
  }
  sendResponse(res, 200, { products: result.items, page: result.page, pageSize: result.pageSize, total: result.total }, 'Vendor products fetched successfully');
});

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await vendorsService.getDashboardStats(req.user.id);
  sendResponse(res, 200, { stats }, 'Vendor dashboard stats fetched successfully');
});

const getOnboardingStatus = catchAsync(async (req, res) => {
  const vendor = await vendorsService.getOnboardingStatus(req.params.id);
  sendResponse(res, 200, { vendor }, 'Vendor onboarding status fetched successfully');
});

const getOperatingHours = catchAsync(async (req, res) => {
  const hours = await vendorsService.getVendorOperatingHours(req.user.id);
  sendResponse(res, 200, { hours }, 'Operating hours fetched successfully');
});

const updateOperatingHours = catchAsync(async (req, res) => {
  const hours = await vendorsService.updateVendorOperatingHours(req.user.id, req.body.hours || []);
  sendResponse(res, 200, { hours }, 'Operating hours updated successfully');
});

const getServiceAreas = catchAsync(async (req, res) => {
  const areas = await vendorsService.getVendorServiceAreas(req.user.id);
  sendResponse(res, 200, { areas }, 'Service areas fetched successfully');
});

const updateServiceAreas = catchAsync(async (req, res) => {
  const areas = await vendorsService.updateVendorServiceAreas(req.user.id, req.body.areas || []);
  sendResponse(res, 200, { areas }, 'Service areas updated successfully');
});

const getAvailability = catchAsync(async (req, res) => {
  const availability = await vendorsService.getVendorAvailability(req.user.id);
  sendResponse(res, 200, { availability }, 'Availability fetched successfully');
});

const updateAvailability = catchAsync(async (req, res) => {
  const availability = await vendorsService.updateVendorAvailability(req.user.id, req.body);
  sendResponse(res, 200, { availability }, 'Availability updated successfully');
});

const getEarningsSummary = catchAsync(async (req, res) => {
  const summary = await vendorsService.getVendorEarningsSummary(req.user.id);
  sendResponse(res, 200, { summary }, 'Vendor earnings summary fetched successfully');
});

const getSettlements = catchAsync(async (req, res) => {
  const settlements = await vendorsService.listVendorSettlements(req.user.id);
  sendResponse(res, 200, { settlements }, 'Vendor settlements fetched successfully');
});

const getAnalyticsOverview = catchAsync(async (req, res) => {
  const overview = await vendorsService.getVendorAnalyticsOverview(req.user.id);
  sendResponse(res, 200, { overview }, 'Vendor analytics overview fetched successfully');
});

const getPerformanceMetrics = catchAsync(async (req, res) => {
  const performance = await vendorsService.getVendorPerformanceMetrics(req.user.id);
  sendResponse(res, 200, { performance }, 'Vendor performance metrics fetched successfully');
});

const getAuditLogs = catchAsync(async (req, res) => {
  const logs = await vendorsService.listVendorAuditLogs(req.user.id);
  sendResponse(res, 200, { logs }, 'Vendor audit logs fetched successfully');
});

const productsService = require('../products/products.service');
const staffService = require('./vendor-staff.service');
const financeService = require('./vendor-finance.service');
const { flattenCategories, DOSAGE_FORMS } = require('../pharmacy/catalog.constants');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { hashPassword, comparePassword } = require('../auth/auth.helper');
const { recordAuditEntry } = require('./vendor-audit.service');
const redisClient = require('../../config/redis');

const getMyProduct = catchAsync(async (req, res) => {
  const product = await productsService.getVendorProductById(req.params.id, req.user.id);
  sendResponse(res, 200, { product }, 'Product fetched successfully');
});

const searchProducts = catchAsync(async (req, res) => {
  const result = await productsService.listVendorProducts(req.user.id, {
    search: req.query.q || req.query.search,
    pageSize: 10,
  });
  sendResponse(res, 200, { products: result.items }, 'Search results fetched');
});

const getCatalog = catchAsync(async (req, res) => {
  sendResponse(res, 200, { categories: flattenCategories(), dosage_forms: DOSAGE_FORMS }, 'Catalog metadata fetched');
});

const getSalesReport = catchAsync(async (req, res) => {
  const report = await financeService.getSalesReport(req.user.id, req.query);
  sendResponse(res, 200, { report }, 'Sales report fetched');
});

const getPayoutOverview = catchAsync(async (req, res) => {
  const overview = await financeService.getPayoutOverview(req.user.id);
  sendResponse(res, 200, { overview }, 'Payout overview fetched');
});

const listStaff = catchAsync(async (req, res) => {
  const staff = await staffService.listStaff(req.user.id);
  sendResponse(res, 200, { staff }, 'Staff fetched');
});

const inviteStaff = catchAsync(async (req, res) => {
  const result = await staffService.inviteStaff(req.user.id, req.body, req.user.accountId || req.user.id);
  sendResponse(res, 201, result, 'Staff invited');
});

const updateStaff = catchAsync(async (req, res) => {
  const staff = await staffService.updateStaff(req.user.id, req.params.id, req.body, req.user.accountId || req.user.id);
  sendResponse(res, 200, { staff }, 'Staff updated');
});

const changePassword = catchAsync(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || String(new_password).length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }
  const vendor = await prisma.vendor.findUnique({
    where: { id: req.user.id },
    include: { account: true },
  });
  const hashed = vendor.account?.password || vendor.password;
  if (hashed && current_password) {
    const ok = await comparePassword(current_password, hashed);
    if (!ok) throw new AppError('Current password is incorrect', 400);
  }
  const nextHash = await hashPassword(new_password);
  if (vendor.account_id) {
    await prisma.account.update({ where: { id: vendor.account_id }, data: { password: nextHash } });
  } else {
    await prisma.vendor.update({ where: { id: vendor.id }, data: { password: nextHash } });
  }
  await recordAuditEntry({
    vendorId: vendor.id,
    userId: req.user.accountId,
    action: 'PASSWORD_CHANGED',
    entity: 'vendor',
    entityId: vendor.id,
  });
  sendResponse(res, 200, { changed: true }, 'Password updated');
});

const listLoginActivity = catchAsync(async (req, res) => {
  const activities = await prisma.vendorLoginActivity.findMany({
    where: { vendor_id: req.user.id },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
  sendResponse(res, 200, { activities }, 'Login activity fetched');
});

const signOutOtherSessions = catchAsync(async (req, res) => {
  const accountId = req.user.accountId || req.user.id;
  try {
    const keys = await redisClient.keys(`refresh_token:${accountId}:*`);
    if (keys.length) await redisClient.del(keys);
  } catch {
    // Redis optional in local development
  }
  sendResponse(res, 200, { signedOut: true }, 'Signed out of other sessions');
});

module.exports = {
  register,
  getProfile,
  updateProfile,
  getAllVendors,
  getMyProducts,
  getMyProduct,
  searchProducts,
  getCatalog,
  getDashboardStats,
  getOnboardingStatus,
  getOperatingHours,
  updateOperatingHours,
  getServiceAreas,
  updateServiceAreas,
  getAvailability,
  updateAvailability,
  getEarningsSummary,
  getSettlements,
  getAnalyticsOverview,
  getPerformanceMetrics,
  getAuditLogs,
  getSalesReport,
  getPayoutOverview,
  listStaff,
  inviteStaff,
  updateStaff,
  changePassword,
  listLoginActivity,
  signOutOtherSessions,
};
