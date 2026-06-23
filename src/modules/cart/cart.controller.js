const catchAsync = require('../../utils/catchAsync');
const cartService = require('./cart.service');
const { sendResponse } = require('../../utils/response');

const getCart = catchAsync(async (req, res) => {
  const cart = await cartService.getCart(req.user.id);
  sendResponse(res, 200, { cart }, 'Cart fetched successfully');
});

const addToCart = catchAsync(async (req, res) => {
  const { product_id, quantity } = req.body;
  const cart = await cartService.addToCart(req.user.id, product_id, quantity);
  sendResponse(res, 200, { cart }, 'Item added to cart');
});

const removeFromCart = catchAsync(async (req, res) => {
  const { product_id } = req.params;
  const cart = await cartService.removeFromCart(req.user.id, product_id);
  sendResponse(res, 200, { cart }, 'Item removed from cart');
});

const clearCart = catchAsync(async (req, res) => {
  await cartService.clearCart(req.user.id);
  sendResponse(res, 204, null, 'Cart cleared');
});

const updateCartItemQuantity = catchAsync(async (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  const cart = await cartService.updateCartItemQuantity(req.user.id, itemId, quantity);
  sendResponse(res, 200, { cart }, 'Cart item quantity updated');
});

const removeFromCartByItemId = catchAsync(async (req, res) => {
  const { itemId } = req.params;
  const cart = await cartService.removeFromCart(req.user.id, itemId);
  sendResponse(res, 200, { cart }, 'Item removed from cart');
});

const mergeCart = catchAsync(async (req, res) => {
  const { items } = req.body;
  const cart = await cartService.mergeCart(req.user.id, items || []);
  sendResponse(res, 200, { cart }, 'Guest cart merged successfully');
});

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  updateCartItemQuantity,
  removeFromCartByItemId,
  mergeCart
};
