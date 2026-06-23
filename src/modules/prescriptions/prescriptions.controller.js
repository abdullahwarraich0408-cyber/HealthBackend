const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const storageService = require('../../storage/storage.service');
const prescriptionsService = require('./prescriptions.service');
const { sendResponse } = require('../../utils/response');
const AppError = require('../../utils/AppError');

const uploadPrescription = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const { order_id, product_id } = req.body;

  // Pass mimetype to storage service for DO spaces
  const fileUrl = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'prescriptions', req.file.mimetype);

  const prescription = await prisma.prescription.create({
    data: {
      customer_id: req.user.id,
      order_id: order_id || null,
      product_id: product_id || null,
      file_url: fileUrl
    }
  });

  sendResponse(res, 201, { prescription }, 'Prescription uploaded successfully');
});

const getMyPrescriptions = catchAsync(async (req, res) => {
  const prescriptions = await prisma.prescription.findMany({
    where: { customer_id: req.user.id }
  });
  sendResponse(res, 200, { prescriptions }, 'Prescriptions fetched');
});

const validatePrescription = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const prescription = await prescriptionsService.verifyPrescription(id, req.user.id, status, notes);

  sendResponse(res, 200, { prescription }, 'Prescription status updated successfully');
});

module.exports = {
  uploadPrescription,
  getMyPrescriptions,
  validatePrescription
};
