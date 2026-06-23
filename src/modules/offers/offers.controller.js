const catchAsync = require('../../utils/catchAsync');
const offersService = require('./offers.service');
const { sendResponse } = require('../../utils/response');

const createOffer = catchAsync(async (req, res) => {
  const offer = await offersService.createOffer(req.user.id, req.body);
  sendResponse(res, 201, { offer }, 'Product offer created successfully');
});

module.exports = {
  createOffer
};
