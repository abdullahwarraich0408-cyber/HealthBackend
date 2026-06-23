const express = require('express');
const router = express.Router();
const cartController = require('./cart.controller');
const cartValidator = require('./cart.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// All customer cart routes require authentication and customer role
router.use(protect);
router.use(restrictTo('customer'));

// GET /api/customer/cart – get cart items
router.get('/', cartController.getCart);

// POST /api/customer/cart – add item to cart
router.post('/', validate(cartValidator.addToCartSchema), cartController.addToCart);

// PUT /api/customer/cart/:itemId – update quantity
router.put('/:itemId', validate(cartValidator.updateCartItemSchema), cartController.updateCartItemQuantity);

// DELETE /api/customer/cart/:itemId – remove item
router.delete('/:itemId', cartController.removeFromCartByItemId);

// POST /api/customer/cart/merge – merge guest cart on login
router.post('/merge', validate(cartValidator.mergeCartSchema), cartController.mergeCart);

module.exports = router;
