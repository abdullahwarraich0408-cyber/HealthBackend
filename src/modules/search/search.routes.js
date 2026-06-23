const express = require('express');
const router = express.Router();
const searchController = require('./search.controller');
const searchValidator = require('./search.validator');
const { validate } = require('../../middleware/validate.middleware');

// GET /api/search/filters – get filter options (categories, brands, price ranges)
router.get('/filters', searchController.getSearchFilters);

// POST /api/search/advanced – advanced search with filters
router.post('/advanced', validate(searchValidator.advancedSearchSchema), searchController.advancedSearch);

// GET /api/search/autocomplete – typeahead suggestions
router.get('/autocomplete', validate(searchValidator.autocompleteSchema), searchController.autocomplete); // Pass-through since controller extracts directly

// GET /api/search/trending – trending searches
router.get('/trending', searchController.trending);

// GET /api/search – multiSearch fallback
router.get('/', searchController.searchAll);

module.exports = router;
