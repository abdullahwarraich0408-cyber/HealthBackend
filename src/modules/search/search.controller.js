const catchAsync = require('../../utils/catchAsync');
const searchService = require('./search.service');
const { sendResponse } = require('../../utils/response');

const searchAll = catchAsync(async (req, res) => {
  const { q } = req.query;
  const results = await searchService.multiSearch(q);
  sendResponse(res, 200, { results }, 'Search results fetched');
});

const getSearchFilters = catchAsync(async (req, res) => {
  const filters = await searchService.getSearchFilters();
  sendResponse(res, 200, { filters }, 'Search filter options fetched successfully');
});

const advancedSearch = catchAsync(async (req, res) => {
  const results = await searchService.advancedSearch(req.body);
  sendResponse(res, 200, results, 'Advanced search completed successfully');
});

const autocomplete = catchAsync(async (req, res) => {
  const { q } = req.query;
  const suggestions = await searchService.autocomplete(q);
  sendResponse(res, 200, { suggestions }, 'Typeahead suggestions fetched successfully');
});

const trending = catchAsync(async (req, res) => {
  const trending = await searchService.getTrendingSearches();
  sendResponse(res, 200, { trending }, 'Trending searches fetched successfully');
});

module.exports = {
  searchAll,
  getSearchFilters,
  advancedSearch,
  autocomplete,
  trending
};
