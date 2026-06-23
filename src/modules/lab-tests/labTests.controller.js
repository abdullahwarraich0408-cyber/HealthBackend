const catchAsync = require('../../utils/catchAsync');
const labTestsService = require('./labTests.service');
const { sendResponse } = require('../../utils/response');

const getCategories = catchAsync(async (req, res) => {
  const categories = await labTestsService.getCategories();
  sendResponse(res, 200, { categories }, 'Lab test categories fetched successfully');
});

const getTimeSlots = catchAsync(async (req, res) => {
  const timeSlots = await labTestsService.getTimeSlots();
  sendResponse(res, 200, { timeSlots }, 'Collection time slots fetched successfully');
});

const getLabs = catchAsync(async (req, res) => {
  const labs = await labTestsService.getLabs(req.query);
  sendResponse(res, 200, { labs }, 'Labs fetched successfully');
});

const getLab = catchAsync(async (req, res) => {
  const lab = await labTestsService.getLabById(req.params.id);
  sendResponse(res, 200, { lab }, 'Lab fetched successfully');
});

const getLabTests = catchAsync(async (req, res) => {
  const tests = await labTestsService.getLabTests(req.query);
  sendResponse(res, 200, { tests }, 'Lab tests fetched successfully');
});

const getPopularLabTests = catchAsync(async (req, res) => {
  const tests = await labTestsService.getPopularLabTests();
  sendResponse(res, 200, { tests }, 'Popular lab tests fetched successfully');
});

const getLabTest = catchAsync(async (req, res) => {
  const test = await labTestsService.getLabTestById(req.params.id);
  sendResponse(res, 200, { test }, 'Lab test fetched successfully');
});

const bookLabTest = catchAsync(async (req, res) => {
  const booking = await labTestsService.bookLabTest(req.user.id, req.body);
  sendResponse(res, 201, { booking }, 'Lab test booked successfully');
});

const createLabOrder = catchAsync(async (req, res) => {
  const order = await labTestsService.createLabOrder(req.user.id, req.body);
  sendResponse(res, 201, order, 'Lab order created successfully');
});

const getMyBookings = catchAsync(async (req, res) => {
  const bookings = await labTestsService.getCustomerBookings(req.user.id);
  sendResponse(res, 200, { bookings }, 'Lab test bookings fetched successfully');
});

const getMyReports = catchAsync(async (req, res) => {
  const reports = await labTestsService.getCustomerReports(req.user.id);
  sendResponse(res, 200, { reports }, 'Lab reports fetched successfully');
});

const cancelBooking = catchAsync(async (req, res) => {
  const booking = await labTestsService.cancelBooking(req.user.id, req.params.id);
  sendResponse(res, 200, { booking }, 'Booking cancelled successfully');
});

const getLabBookings = catchAsync(async (req, res) => {
  const bookings = await labTestsService.getLabBookings(req.user.id);
  sendResponse(res, 200, { bookings }, 'Lab bookings fetched successfully');
});

const updateBookingStatus = catchAsync(async (req, res) => {
  const { status, note } = req.body;
  const booking = await labTestsService.updateBookingStatus(
    req.user.id,
    req.params.id,
    status,
    note
  );
  sendResponse(res, 200, { booking }, `Booking status updated to "${status}"`);
});

const uploadReport = catchAsync(async (req, res) => {
  const booking = await labTestsService.uploadReport(
    req.user.id,
    req.params.id,
    req.body.report_url
  );
  sendResponse(res, 200, { booking }, 'Report uploaded successfully');
});

const assignCollector = catchAsync(async (req, res) => {
  const booking = await labTestsService.assignCollector(req.user.id, req.params.id, req.body);
  sendResponse(res, 200, { booking }, 'Collector assigned successfully');
});

const getAllBookings = catchAsync(async (req, res) => {
  const bookings = await labTestsService.getAllBookings();
  sendResponse(res, 200, { bookings }, 'All lab bookings fetched successfully');
});

module.exports = {
  getCategories,
  getTimeSlots,
  getLabs,
  getLab,
  getLabTests,
  getPopularLabTests,
  getLabTest,
  bookLabTest,
  createLabOrder,
  getMyBookings,
  getMyReports,
  cancelBooking,
  getLabBookings,
  updateBookingStatus,
  uploadReport,
  assignCollector,
  getAllBookings,
};
