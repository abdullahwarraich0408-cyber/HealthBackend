const express = require('express');
const router = express.Router();
const reviewsController = require('./reviews.controller');
const reviewsValidator = require('./reviews.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// All direct review modifications require authentication and customer role
router.use(protect);
router.use(restrictTo('customer'));

// POST /api/reviews – submit review for product/vendor
router.post('/', validate(reviewsValidator.submitReviewSchema), reviewsController.submitReview);

// PUT /api/reviews/:id – update own review
router.put('/:id', validate(reviewsValidator.updateReviewSchema), reviewsController.updateReview);

// DELETE /api/reviews/:id – delete own review
router.delete('/:id', reviewsController.deleteReview);

module.exports = router;
