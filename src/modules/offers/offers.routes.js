const express = require('express');
const router = express.Router();
const offersController = require('./offers.controller');
const offersValidator = require('./offers.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// POST /api/vendor/offers – vendor create product offer
router.post('/', protect, restrictTo('vendor'), validate(offersValidator.createOfferSchema), offersController.createOffer);

module.exports = router;
