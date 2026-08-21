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
inventoryRouter.post('/validate', upload.single('file'), inventoryController.validateImport);
inventoryRouter.get('/', inventoryController.listInventory);
inventoryRouter.get('/batches', inventoryController.listBatches);
inventoryRouter.post('/batches', inventoryController.addBatch);
inventoryRouter.get('/expiring', inventoryController.listExpiring);
inventoryRouter.get('/low-stock', validate(inventoryValidator.lowStockSchema), inventoryController.getLowStock);
inventoryRouter.post('/sync', inventoryController.syncInventory);
inventoryRouter.post('/:id/adjust', inventoryController.adjustInventory);

productsRouter.put('/:id/stock', validate(inventoryValidator.updateStockSchema), inventoryController.updateStock);

module.exports = {
  inventoryRouter,
  productsRouter
};
