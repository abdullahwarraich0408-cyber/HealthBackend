const express = require('express');
const router = express.Router();
const uploadController = require('./upload.controller');
const upload = require('../../middleware/upload.middleware');
const videoUpload = require('../../middleware/videoUpload.middleware');
const { protect } = require('../../middleware/auth.middleware');

router.post('/public-document', upload.single('document'), uploadController.uploadPublicDocument);

router.use(protect);

router.post('/image', upload.single('image'), uploadController.uploadImage);
router.post('/document', upload.single('document'), uploadController.uploadDocument);
router.post('/video', videoUpload.single('video'), uploadController.uploadVideo);

module.exports = router;
