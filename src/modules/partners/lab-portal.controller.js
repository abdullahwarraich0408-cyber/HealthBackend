const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const { sendResponse } = require('../../utils/response');
const storageService = require('../../storage/storage.service');
const labPortalService = require('./lab-portal.service');

const getProfile = catchAsync(async (req, res) => {
  const lab = await labPortalService.getProfile(req.user.id);
  sendResponse(res, 200, { lab }, 'Lab profile fetched');
});

const updateProfile = catchAsync(async (req, res) => {
  const lab = await labPortalService.updateProfile(req.user.id, req.body);
  sendResponse(res, 200, { lab }, 'Lab profile updated');
});

const updatePassword = catchAsync(async (req, res) => {
  await labPortalService.updatePassword(req.user.id, req.body.current, req.body.new);
  sendResponse(res, 200, null, 'Password updated successfully');
});

const getBookings = catchAsync(async (req, res) => {
  const bookings = await labPortalService.getBookings(req.user.id);
  sendResponse(res, 200, { bookings }, 'Bookings fetched');
});

const updateBookingStatus = catchAsync(async (req, res) => {
  const booking = await labPortalService.updateBookingStatus(
    req.user.id,
    req.params.id,
    req.body.status,
    req.body.note
  );
  sendResponse(res, 200, { booking }, 'Booking updated');
});

const uploadReport = catchAsync(async (req, res) => {
  const booking = await labPortalService.uploadReport(
    req.user.id,
    req.params.id,
    req.body.report_url
  );
  sendResponse(res, 200, { booking }, 'Report uploaded');
});

const uploadReportFile = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Report PDF file is required', 400);

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    throw new AppError('Only PDF or image files are allowed', 400);
  }

  const url = await storageService.uploadFile(
    req.file.buffer,
    req.file.originalname,
    'reports',
    req.file.mimetype
  );

  const booking = await labPortalService.uploadReport(req.user.id, req.params.id, url);
  sendResponse(res, 200, { booking, url }, 'Report uploaded');
});

const assignCollector = catchAsync(async (req, res) => {
  const booking = await labPortalService.assignCollector(req.user.id, req.params.id, req.body);
  sendResponse(res, 200, { booking }, 'Collector assigned');
});

const getTests = catchAsync(async (req, res) => {
  const tests = await labPortalService.getTests(req.user.id);
  sendResponse(res, 200, { tests }, 'Tests fetched');
});

const createTest = catchAsync(async (req, res) => {
  const test = await labPortalService.createTest(req.user.id, req.body);
  sendResponse(res, 201, { test }, 'Test created');
});

const updateTest = catchAsync(async (req, res) => {
  const test = await labPortalService.updateTest(req.user.id, req.params.id, req.body);
  sendResponse(res, 200, { test }, 'Test updated');
});

const deleteTest = catchAsync(async (req, res) => {
  await labPortalService.deleteTest(req.user.id, req.params.id);
  sendResponse(res, 200, null, 'Test deactivated');
});

const getReportsSummary = catchAsync(async (req, res) => {
  const summary = await labPortalService.getReportsSummary(req.user.id);
  sendResponse(res, 200, { summary }, 'Report summary fetched');
});

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  getBookings,
  updateBookingStatus,
  uploadReport,
  uploadReportFile,
  assignCollector,
  getTests,
  createTest,
  updateTest,
  deleteTest,
  getReportsSummary,
};
