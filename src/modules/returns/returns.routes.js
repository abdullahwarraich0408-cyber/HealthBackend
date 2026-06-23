const express = require('express');
const returnsController = require('./returns.controller');
const returnsValidator = require('./returns.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

const customerReturnsRouter = express.Router();
const adminReturnsRouter = express.Router();
const vendorReturnsRouter = express.Router();

// Customer Returns Routes
customerReturnsRouter.use(protect);
customerReturnsRouter.use(restrictTo('customer'));
customerReturnsRouter.post('/', validate(returnsValidator.requestReturnSchema), returnsController.requestReturn);
customerReturnsRouter.get('/', returnsController.getCustomerReturns);

// Admin Returns Routes
adminReturnsRouter.use(protect);
adminReturnsRouter.use(restrictTo('admin'));
adminReturnsRouter.put('/:id/status', validate(returnsValidator.updateReturnStatusSchema), returnsController.updateReturnStatus);

// Vendor Returns Routes
vendorReturnsRouter.use(protect);
vendorReturnsRouter.use(restrictTo('vendor'));
vendorReturnsRouter.post('/:id/process', validate(returnsValidator.processReturnSchema), returnsController.processReturn);

module.exports = {
  customerReturnsRouter,
  adminReturnsRouter,
  vendorReturnsRouter
};
