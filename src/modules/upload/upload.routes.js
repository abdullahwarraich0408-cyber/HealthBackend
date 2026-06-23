const express = require('express');
const router = express.Router();
const uploadController = require('./upload.controller');
const upload = require('../../middleware/upload.middleware');
const { protect } = require('../../middleware/auth.middleware');

router.use(protect);

router.post('/image', upload.single('image'), uploadController.uploadImage);
router.post('/document', upload.single('document'), uploadController.uploadDocument);

module.exports = router;
