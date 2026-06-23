const express = require('express');
const router = express.Router();
const productsController = require('./products.controller');
const productsValidator = require('./products.validator');
const reviewsController = require('../reviews/reviews.controller');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// Public routes
router.get('/', productsController.getProducts);
router.get('/:id', productsController.getProduct);
router.get('/:id/reviews', reviewsController.getProductReviews);

// Protected routes (Vendor only)
router.use(protect);
router.use(restrictTo('vendor'));
router.post('/', validate(productsValidator.createProductSchema), productsController.createProduct);
router.patch('/:id', validate(productsValidator.updateProductSchema), productsController.updateProduct);
router.delete('/:id', productsController.deleteProduct);

module.exports = router;
