const express = require('express');
const router = express.Router();
const payoutsController = require('./payouts.controller');
const { protect, restrictTo } = require('../../middleware/auth.middleware');

router.get('/my-payouts', protect, restrictTo('vendor'), payoutsController.getMyPayouts);
router.post('/trigger', protect, restrictTo('admin'), payoutsController.triggerPayout);

module.exports = router;
