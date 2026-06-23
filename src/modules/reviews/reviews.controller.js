const catchAsync = require('../../utils/catchAsync');
const reviewsService = require('./reviews.service');
const { sendResponse } = require('../../utils/response');

const getProductReviews = catchAsync(async (req, res) => {
  const { id } = req.params;
  const reviews = await reviewsService.fetchProductReviews(id);
  sendResponse(res, 200, { reviews }, 'Product reviews fetched successfully');
});

const getVendorReviews = catchAsync(async (req, res) => {
  const { id } = req.params;
  const reviews = await reviewsService.fetchVendorReviews(id);
  sendResponse(res, 200, { reviews }, 'Vendor reviews fetched successfully');
});

const submitReview = catchAsync(async (req, res) => {
  const review = await reviewsService.submitReview(req.user.id, req.body);
  sendResponse(res, 201, { review }, 'Review submitted successfully');
});

const updateReview = catchAsync(async (req, res) => {
  const { id } = req.params;
  const review = await reviewsService.updateReview(req.user.id, id, req.body);
  sendResponse(res, 200, { review }, 'Review updated successfully');
});

const deleteReview = catchAsync(async (req, res) => {
  const { id } = req.params;
  await reviewsService.deleteReview(req.user.id, id);
  sendResponse(res, 200, null, 'Review deleted successfully');
});

module.exports = {
  getProductReviews,
  getVendorReviews,
  submitReview,
  updateReview,
  deleteReview
};
