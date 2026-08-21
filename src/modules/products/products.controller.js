const catchAsync = require('../../utils/catchAsync');
const productsService = require('./products.service');
const { sendResponse } = require('../../utils/response');

const createProduct = catchAsync(async (req, res) => {
  const product = await productsService.createProduct(req.user.id, req.body);
  const message = product.approval_status === 'draft'
    ? 'Product saved as draft'
    : 'Product submitted successfully and is pending review';
  sendResponse(res, 201, { product }, message);
});

const getProducts = catchAsync(async (req, res) => {
  const products = await productsService.getProducts(req.query);
  sendResponse(res, 200, { products }, 'Products fetched successfully');
});

const getProduct = catchAsync(async (req, res) => {
  const product = await productsService.getProductById(req.params.id);
  sendResponse(res, 200, { product }, 'Product fetched successfully');
});

const updateProduct = catchAsync(async (req, res) => {
  const product = await productsService.updateProduct(req.params.id, req.user.id, req.body);
  sendResponse(res, 200, { product }, 'Product updated successfully');
});

const deleteProduct = catchAsync(async (req, res) => {
  await productsService.deleteProduct(req.params.id, req.user.id);
  sendResponse(res, 200, { deleted: true }, 'Product archived successfully');
});

const duplicateProduct = catchAsync(async (req, res) => {
  const product = await productsService.duplicateProduct(req.params.id, req.user.id);
  sendResponse(res, 201, { product }, 'Product duplicated as draft');
});

const setListingStatus = catchAsync(async (req, res) => {
  const product = await productsService.setListingStatus(req.params.id, req.user.id, req.body.listing_status);
  sendResponse(res, 200, { product }, 'Product listing updated');
});

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  duplicateProduct,
  setListingStatus,
};
