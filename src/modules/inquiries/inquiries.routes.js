const express = require('express');
const router = express.Router();
const controller = require('./inquiries.controller');
const validator = require('./inquiries.validator');
const { optionalAuth, protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const { validate } = require('../../middleware/validate.middleware');

router.post('/', optionalAuth, validate(validator.createInquirySchema), controller.createInquiry);
router.get('/', protect, restrictTo('admin'), controller.listInquiries);
router.patch('/:id', protect, restrictTo('admin'), validate(validator.updateInquirySchema), controller.updateInquiry);

module.exports = router;
