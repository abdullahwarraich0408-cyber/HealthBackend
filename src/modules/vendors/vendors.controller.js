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
  const products = await vendorsService.getMyProducts(req.user.id);
  sendResponse(res, 200, { products }, 'Vendor products fetched successfully');
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

module.exports = {
  register,
  getProfile,
  updateProfile,
  getAllVendors,
  getMyProducts,
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
};
