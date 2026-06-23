const express = require('express');
const router = express.Router();
const cartController = require('./cart.controller');
const cartValidator = require('./cart.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

router.use(protect);
router.use(restrictTo('customer'));

router.get('/', cartController.getCart);
router.post('/', validate(cartValidator.addToCartSchema), cartController.addToCart);
router.delete('/:product_id', cartController.removeFromCart);
router.delete('/', cartController.clearCart);

module.exports = router;
