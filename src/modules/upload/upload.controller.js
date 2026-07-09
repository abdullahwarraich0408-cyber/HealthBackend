const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const storageService = require('../../storage/storage.service');
const { sendResponse } = require('../../utils/response');

const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No image file provided', 400);

  const url = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'images', req.file.mimetype);
  sendResponse(res, 200, { url }, 'Image uploaded successfully');
});

const uploadDocument = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No document file provided', 400);

  const url = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'documents', req.file.mimetype);
  sendResponse(res, 200, { url }, 'Document uploaded successfully');
});

const uploadPublicDocument = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No document file provided', 400);

  const url = await storageService.uploadFile(req.file.buffer, req.file.originalname, 'public-documents', req.file.mimetype);
  sendResponse(res, 200, { url }, 'Public document uploaded successfully');
});

const uploadVideo = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError('No video file provided', 400);

  const url = await storageService.uploadFile(
    req.file.buffer,
    req.file.originalname,
    'community-videos',
    req.file.mimetype,
  );
  sendResponse(res, 200, { url }, 'Video uploaded successfully');
});

module.exports = {
  uploadImage,
  uploadDocument,
  uploadPublicDocument,
  uploadVideo,
};
