const express = require('express');
const router = express.Router();
const clinicalController = require('./clinical.controller');
const clinicalValidator = require('./clinical.validator');
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');

router.get(
  '/documents',
  protect,
  restrictTo('customer'),
  clinicalController.listDocuments
);
router.post(
  '/documents',
  protect,
  restrictTo('customer'),
  validate(clinicalValidator.createDocumentSchema),
  clinicalController.createDocument
);
router.delete(
  '/documents/:id',
  protect,
  restrictTo('customer'),
  clinicalController.deleteDocument
);
router.get(
  '/timeline',
  protect,
  restrictTo('customer'),
  clinicalController.getTimeline
);

module.exports = router;
