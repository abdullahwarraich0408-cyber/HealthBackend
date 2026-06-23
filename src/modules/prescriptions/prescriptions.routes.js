const express = require('express');
const router = express.Router();
const prescriptionsController = require('./prescriptions.controller');
const prescriptionsValidator = require('./prescriptions.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const upload = require('../../middleware/upload.middleware');

router.use(protect);

// GET /api/prescriptions - get prescription history (Customer)
router.get('/', restrictTo('customer'), prescriptionsController.getMyPrescriptions);

// POST /api/prescriptions/upload - upload prescription image (Customer)
router.post('/upload', restrictTo('customer'), upload.single('prescriptionFile'), prescriptionsController.uploadPrescription);

// POST /api/prescriptions/:id/validate - admin/vendor validation
router.post('/:id/validate', restrictTo('admin', 'vendor'), validate(prescriptionsValidator.validatePrescriptionSchema), prescriptionsController.validatePrescription);

module.exports = router;
