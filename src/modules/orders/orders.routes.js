const express = require('express');
const router = express.Router();
const ordersController = require('./orders.controller');
const ordersValidator = require('./orders.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

router.use(protect);

// Customers
router.post('/', restrictTo('customer'), validate(ordersValidator.createOrderSchema), ordersController.createOrder);
router.get('/', ordersController.getMyOrders);

// Vendors
router.get('/vendor', restrictTo('vendor'), ordersController.getVendorOrders);

// Get specific order details (customer or vendor)
router.get('/:id', ordersController.getOrderDetails);

// Update status (vendor only)
router.patch('/:id/status', restrictTo('vendor'), validate(ordersValidator.updateOrderStatusSchema), ordersController.updateOrderStatus);

module.exports = router;
