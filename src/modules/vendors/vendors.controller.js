const catchAsync = require('../../utils/catchAsync');
const vendorsService = require('./vendors.service');
const { sendResponse } = require('../../utils/response');

const register = catchAsync(async (req, res) => {
  const vendor = await vendorsService.registerVendor(req.body);
  vendor.password = undefined;
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

module.exports = {
  register,
  getProfile,
  updateProfile,
  getAllVendors,
  getMyProducts,
  getDashboardStats,
};
