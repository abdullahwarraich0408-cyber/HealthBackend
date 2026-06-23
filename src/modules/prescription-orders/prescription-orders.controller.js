const catchAsync = require('../../utils/catchAsync');
const storageService = require('../../storage/storage.service');
const { sendResponse } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const prescriptionOrdersService = require('./prescription-orders.service');

const createOrder = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('Prescription file is required', 400);

  const { delivery_address, delivery_type, medicines } = req.body;
  let parsedAddress = delivery_address;
  let parsedMedicines = medicines;

  if (typeof delivery_address === 'string') {
    parsedAddress = JSON.parse(delivery_address);
  }
  if (typeof medicines === 'string' && medicines) {
    parsedMedicines = JSON.parse(medicines);
  }

  if (!parsedAddress) throw new AppError('Delivery address is required', 400);

  const fileUrl = await storageService.uploadFile(
    req.file.buffer,
    req.file.originalname,
    'prescriptions',
    req.file.mimetype
  );

  const order = await prescriptionOrdersService.createPrescriptionOrder(req.user.id, {
    file_url: fileUrl,
    delivery_address: parsedAddress,
    delivery_type,
    medicines: parsedMedicines,
  });

  sendResponse(res, 201, { order }, 'Prescription order created. Finding nearest pharmacy...');
});

const getMyOrders = catchAsync(async (req, res) => {
  const orders = await prescriptionOrdersService.getCustomerOrders(req.user.id);
  sendResponse(res, 200, { orders }, 'Prescription orders fetched');
});

const getVendorOrders = catchAsync(async (req, res) => {
  const orders = await prescriptionOrdersService.getVendorPendingOrders(req.user.id);
  sendResponse(res, 200, { orders }, 'Prescription orders fetched');
});

const getVendorHistory = catchAsync(async (req, res) => {
  const orders = await prescriptionOrdersService.getVendorPrescriptionHistory(req.user.id);
  sendResponse(res, 200, { orders }, 'Prescription order history fetched');
});

const getAdminOrders = catchAsync(async (req, res) => {
  const orders = await prescriptionOrdersService.getAllPrescriptionOrders();
  sendResponse(res, 200, { orders }, 'Prescription orders fetched');
});

const getOrder = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.getOrderById(req.params.id, req.user.id, req.user.role);
  sendResponse(res, 200, { order }, 'Prescription order fetched');
});

const vendorAccept = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.vendorRespond(req.params.id, req.user.id, 'accept');
  sendResponse(res, 200, { order }, 'Order accepted');
});

const vendorDecline = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.vendorRespond(req.params.id, req.user.id, 'decline');
  sendResponse(res, 200, { order }, 'Order declined');
});

const confirmStock = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.confirmStock(req.params.id, req.user.id, req.body);
  sendResponse(res, 200, { order }, 'Stock status updated');
});

const customerConfirm = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.customerConfirm(
    req.params.id,
    req.user.id,
    req.body.confirmed !== false
  );
  sendResponse(res, 200, { order }, 'Review submitted');
});

const updateStatus = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.updateDeliveryStatus(
    req.params.id,
    req.user.id,
    req.body.status
  );
  sendResponse(res, 200, { order }, 'Status updated');
});

const markPacked = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.markPacked(req.params.id, req.user.id);
  sendResponse(res, 200, { order }, 'Order marked as packed');
});

const retrySearch = catchAsync(async (req, res) => {
  const order = await prescriptionOrdersService.retryVendorSearch(req.params.id, req.user.id);
  sendResponse(res, 200, { order }, 'Searching for pharmacies again...');
});

module.exports = {
  createOrder,
  getMyOrders,
  getVendorOrders,
  getVendorHistory,
  getAdminOrders,
  getOrder,
  vendorAccept,
  vendorDecline,
  confirmStock,
  customerConfirm,
  updateStatus,
  markPacked,
  retrySearch,
};
