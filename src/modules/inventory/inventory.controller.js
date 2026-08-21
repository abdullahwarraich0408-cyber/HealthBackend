const catchAsync = require('../../utils/catchAsync');
const inventoryService = require('./inventory.service');
const { sendResponse } = require('../../utils/response');
const AppError = require('../../utils/AppError');

const bulkImport = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No CSV file uploaded', 400);
  }

  const csvText = req.file.buffer.toString('utf-8');
  if (req.query.validate === 'true' || req.body?.validate) {
    const rows = await inventoryService.validateBulkRows(req.user.id, csvText);
    sendResponse(res, 200, { rows, valid: rows.filter((row) => row.valid).length }, 'Import preview generated');
    return;
  }

  const result = await inventoryService.bulkImport(req.user.id, csvText, {
    importValidOnly: req.query.import_valid_only !== 'false',
  });

  sendResponse(res, 201, result, `${result.count} products imported successfully`);
});

const validateImport = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No CSV file uploaded', 400);
  const rows = await inventoryService.validateBulkRows(req.user.id, req.file.buffer.toString('utf-8'));
  sendResponse(res, 200, { rows }, 'Validation completed');
});

const updateStock = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { stock, reason } = req.body;
  const product = await inventoryService.updateStock(req.user.id, id, stock, {
    reason,
    performedBy: req.user.accountId || req.user.id,
  });
  sendResponse(res, 200, { product }, 'Stock quantity updated successfully');
});

const getLowStock = catchAsync(async (req, res) => {
  const threshold = req.query.threshold !== undefined ? req.query.threshold : undefined;
  const products = await inventoryService.getLowStock(req.user.id, threshold);
  sendResponse(res, 200, { products }, 'Low stock products retrieved successfully');
});

const syncInventory = catchAsync(async (req, res) => {
  const result = await inventoryService.syncInventory(req.user.id);
  sendResponse(res, 200, result, 'Inventory synchronization triggered successfully');
});

const listInventory = catchAsync(async (req, res) => {
  const result = await inventoryService.listInventory(req.user.id, req.query);
  sendResponse(res, 200, result, 'Inventory fetched successfully');
});

const listBatches = catchAsync(async (req, res) => {
  const batches = await inventoryService.listBatches(req.user.id, req.query);
  sendResponse(res, 200, { batches }, 'Batches fetched successfully');
});

const addBatch = catchAsync(async (req, res) => {
  const batch = await inventoryService.addBatch(req.user.id, req.body, req.user.accountId || req.user.id);
  sendResponse(res, 201, { batch }, 'Batch added successfully');
});

const adjustInventory = catchAsync(async (req, res) => {
  const product = await inventoryService.adjustInventory(req.user.id, req.params.id, {
    ...req.body,
    performedBy: req.user.accountId || req.user.id,
  });
  sendResponse(res, 200, { product }, 'Inventory adjusted successfully');
});

const listExpiring = catchAsync(async (req, res) => {
  const batches = await inventoryService.listExpiring(req.user.id);
  sendResponse(res, 200, { batches }, 'Expiring batches fetched');
});

module.exports = {
  bulkImport,
  validateImport,
  updateStock,
  getLowStock,
  syncInventory,
  listInventory,
  listBatches,
  addBatch,
  adjustInventory,
  listExpiring,
};
