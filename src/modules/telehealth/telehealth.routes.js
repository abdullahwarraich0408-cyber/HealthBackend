const express = require('express');
const router = express.Router();
const telehealthController = require('./telehealth.controller');
const telehealthValidator = require('./telehealth.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');

router.use(protect);

router.get('/appointments/:appointmentId/chat', telehealthController.getChat);
router.post(
  '/appointments/:appointmentId/chat/messages',
  validate(telehealthValidator.sendMessageSchema),
  telehealthController.sendMessage
);
router.patch('/appointments/:appointmentId/chat/read', telehealthController.markRead);
router.get('/appointments/:appointmentId/video', telehealthController.getVideoAccess);

module.exports = router;
