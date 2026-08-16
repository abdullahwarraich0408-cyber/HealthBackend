const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const homeSlidesService = require('./homeSlides.service');

const listPublic = catchAsync(async (req, res) => {
  const audience = req.query.audience === 'returning' ? 'returning' : 'first_visit';
  const slides = await homeSlidesService.listPublic(audience);
  sendResponse(res, 200, { slides, audience }, 'Home posters loaded');
});

const listAdmin = catchAsync(async (req, res) => {
  const slides = await homeSlidesService.listAdmin();
  sendResponse(res, 200, { slides }, 'Home posters loaded');
});

const updateSlide = catchAsync(async (req, res) => {
  const slide = await homeSlidesService.updateSlide(req.params.id, req.body);
  sendResponse(res, 200, { slide }, 'Poster updated');
});

module.exports = {
  listPublic,
  listAdmin,
  updateSlide,
};
