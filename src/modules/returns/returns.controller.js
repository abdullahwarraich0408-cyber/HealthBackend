const catchAsync = require('../../utils/catchAsync');
const returnsService = require('./returns.service');
const { sendResponse } = require('../../utils/response');

const requestReturn = catchAsync(async (req, res) => {
  const returnRequest = await returnsService.requestReturn(req.user.id, req.body);
  sendResponse(res, 201, { returnRequest }, 'Return request submitted successfully');
});

const getCustomerReturns = catchAsync(async (req, res) => {
  const returns = await returnsService.getCustomerReturns(req.user.id);
  sendResponse(res, 200, { returns }, 'Customer return requests retrieved successfully');
});

const updateReturnStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const returnRequest = await returnsService.updateReturnStatus(req.user.id, id, req.body);
  sendResponse(res, 200, { returnRequest }, `Return request status updated to ${req.body.status}`);
});

const processReturn = catchAsync(async (req, res) => {
  const { id } = req.params;
  const returnRequest = await returnsService.processReturn(req.user.id, id, req.body);
  sendResponse(res, 200, { returnRequest }, 'Return request processed and completed successfully');
});

module.exports = {
  requestReturn,
  getCustomerReturns,
  updateReturnStatus,
  processReturn
};
