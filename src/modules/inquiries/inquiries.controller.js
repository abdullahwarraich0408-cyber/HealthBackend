const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const inquiriesService = require('./inquiries.service');

const createInquiry = catchAsync(async (req, res) => {
  const inquiry = await inquiriesService.createInquiry(req.body, req.user?.id || null);
  sendResponse(res, 201, { inquiry }, 'Inquiry submitted successfully');
});

const listInquiries = catchAsync(async (req, res) => {
  const inquiries = await inquiriesService.listInquiries();
  sendResponse(res, 200, { inquiries }, 'Inquiries fetched successfully');
});

const updateInquiry = catchAsync(async (req, res) => {
  const inquiry = await inquiriesService.updateInquiry(req.params.id, req.body);
  sendResponse(res, 200, { inquiry }, 'Inquiry updated');
});

module.exports = {
  createInquiry,
  listInquiries,
  updateInquiry,
};
