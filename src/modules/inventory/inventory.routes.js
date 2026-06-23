const express = require('express');
const inventoryController = require('./inventory.controller');
const inventoryValidator = require('./inventory.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const upload = require('../../middleware/upload.middleware');

const inventoryRouter = express.Router();
const productsRouter = express.Router();

// Apply protective middlewares to both routers (Vendor access only)
inventoryRouter.use(protect);
inventoryRouter.use(restrictTo('vendor'));

productsRouter.use(protect);
productsRouter.use(restrictTo('vendor'));

// Vendor Inventory endpoints
// POST /api/vendor/inventory/bulk
inventoryRouter.post('/bulk', upload.single('file'), inventoryController.bulkImport);

// GET /api/vendor/inventory/low-stock
inventoryRouter.get('/low-stock', validate(inventoryValidator.lowStockSchema), inventoryController.getLowStock);

// POST /api/vendor/inventory/sync
inventoryRouter.post('/sync', inventoryController.syncInventory);

// Vendor Products endpoints
// PUT /api/vendor/products/:id/stock
productsRouter.put('/:id/stock', validate(inventoryValidator.updateStockSchema), inventoryController.updateStock);

module.exports = {
  inventoryRouter,
  productsRouter
};
