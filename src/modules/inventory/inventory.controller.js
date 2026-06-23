const catchAsync = require('../../utils/catchAsync');
const inventoryService = require('./inventory.service');
const { sendResponse } = require('../../utils/response');
const AppError = require('../../utils/AppError');

const bulkImport = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No CSV file uploaded', 400);
  }

  const csvText = req.file.buffer.toString('utf-8');
  const result = await inventoryService.bulkImport(req.user.id, csvText);

  sendResponse(res, 201, result, `${result.count} products imported successfully`);
});

const updateStock = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;

  const product = await inventoryService.updateStock(req.user.id, id, stock);

  sendResponse(res, 200, { product }, 'Stock quantity updated successfully');
});

const getLowStock = catchAsync(async (req, res) => {
  const threshold = req.query.threshold !== undefined ? req.query.threshold : 10;
  const products = await inventoryService.getLowStock(req.user.id, threshold);

  sendResponse(res, 200, { products }, 'Low stock products retrieved successfully');
});

const syncInventory = catchAsync(async (req, res) => {
  const result = await inventoryService.syncInventory(req.user.id);

  sendResponse(res, 200, result, 'Inventory synchronization triggered successfully');
});

module.exports = {
  bulkImport,
  updateStock,
  getLowStock,
  syncInventory
};
