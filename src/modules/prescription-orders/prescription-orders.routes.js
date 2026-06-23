const express = require('express');
const router = express.Router();
const controller = require('./prescription-orders.controller');
const validator = require('./prescription-orders.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const upload = require('../../middleware/upload.middleware');

router.use(protect);

router.post(
  '/',
  restrictTo('customer'),
  upload.single('prescriptionFile'),
  validate(validator.createOrderSchema),
  controller.createOrder
);

router.get('/', restrictTo('customer'), controller.getMyOrders);
router.get('/vendor', restrictTo('vendor'), controller.getVendorOrders);
router.get('/vendor/history', restrictTo('vendor'), controller.getVendorHistory);
router.get('/:id', validate(validator.orderIdSchema), controller.getOrder);

router.post('/:id/accept', restrictTo('vendor'), validate(validator.orderIdSchema), controller.vendorAccept);
router.post('/:id/decline', restrictTo('vendor'), validate(validator.orderIdSchema), controller.vendorDecline);
router.post('/:id/stock', restrictTo('vendor'), validate(validator.confirmStockSchema), controller.confirmStock);
router.post('/:id/packed', restrictTo('vendor'), validate(validator.orderIdSchema), controller.markPacked);
router.patch('/:id/status', restrictTo('vendor'), validate(validator.updateStatusSchema), controller.updateStatus);

router.post('/:id/confirm', restrictTo('customer'), validate(validator.customerConfirmSchema), controller.customerConfirm);
router.post('/:id/retry', restrictTo('customer'), validate(validator.orderIdSchema), controller.retrySearch);

module.exports = router;
