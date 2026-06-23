const catchAsync = require('../../utils/catchAsync');
const reportsService = require('./reports.service');
const { sendResponse } = require('../../utils/response');

const getVendorReport = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  const vendorId = req.user.role === 'vendor' ? req.user.id : req.params.vendorId;
  
  const report = await reportsService.generateVendorReport(vendorId, startDate || new Date(0), endDate || new Date());
  sendResponse(res, 200, { report });
});

const getAdminReport = catchAsync(async (req, res) => {
  const report = await reportsService.generateAdminSystemReport();
  sendResponse(res, 200, { report });
});

module.exports = {
  getVendorReport,
  getAdminReport
};
