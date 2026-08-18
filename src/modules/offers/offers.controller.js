const catchAsync = require('../../utils/catchAsync');
const offersService = require('./offers.service');
const { sendResponse } = require('../../utils/response');

const getPublicOffers = catchAsync(async (req, res) => {
  const offers = await offersService.getPublicOffers(req.query);
  sendResponse(res, 200, { offers }, 'Offers retrieved successfully');
});

const getOfferById = catchAsync(async (req, res) => {
  const offer = await offersService.getOfferById(req.params.id);
  sendResponse(res, 200, { offer }, 'Offer details retrieved successfully');
});

const evaluateOffers = catchAsync(async (req, res) => {
  const result = await offersService.evaluateCheckoutOffers({
    userId: req.user?.id || null,
    ...req.body,
  });
  sendResponse(res, 200, result, 'Offers evaluated successfully');
});

const validatePromoCode = catchAsync(async (req, res) => {
  const result = await offersService.validatePromoCode({
    userId: req.user?.id || null,
    ...req.body,
  });
  sendResponse(res, 200, result, 'Promo code validated successfully');
});

const updateAlertPreferences = catchAsync(async (req, res) => {
  const user = await offersService.updateAlertPreferences(req.user.id, req.body);
  sendResponse(res, 200, { user }, 'Alert preferences updated successfully');
});

// Admin Controllers
const adminGetOffers = catchAsync(async (req, res) => {
  const offers = await offersService.getAdminOffers(req.query);
  sendResponse(res, 200, { offers }, 'Admin offers list retrieved successfully');
});

const adminCreateOffer = catchAsync(async (req, res) => {
  const offer = await offersService.createOffer(req.user.id, req.body);
  sendResponse(res, 201, { offer }, 'Offer created successfully');
});

const adminUpdateStatus = catchAsync(async (req, res) => {
  const offer = await offersService.updateOfferStatus(req.params.id, req.body.status);
  sendResponse(res, 200, { offer }, 'Offer status updated successfully');
});

const adminDeleteOffer = catchAsync(async (req, res) => {
  await offersService.deleteOffer(req.params.id);
  sendResponse(res, 200, null, 'Offer deleted successfully');
});

const adminGetRedemptions = catchAsync(async (req, res) => {
  const data = await offersService.getOfferRedemptions(req.params.id);
  sendResponse(res, 200, data, 'Offer redemptions analytics retrieved');
});

module.exports = {
  getPublicOffers,
  getOfferById,
  evaluateOffers,
  validatePromoCode,
  updateAlertPreferences,
  adminGetOffers,
  adminCreateOffer,
  adminUpdateStatus,
  adminDeleteOffer,
  adminGetRedemptions,
};
