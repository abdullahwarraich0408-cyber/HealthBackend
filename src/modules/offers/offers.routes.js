const express = require('express');
const router = express.Router();
const offersController = require('./offers.controller');
const { protect, optionalAuth } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

// Public Customer Offer Routes
router.get('/', offersController.getPublicOffers);
router.get('/:id', offersController.getOfferById);
router.post('/evaluate', optionalAuth, offersController.evaluateOffers);
router.post('/validate-code', optionalAuth, offersController.validatePromoCode);
router.post('/alert-preference', protect, offersController.updateAlertPreferences);

// Admin Offer Routes
router.get('/admin/all', protect, restrictTo('admin'), offersController.adminGetOffers);
router.post('/admin/create', protect, restrictTo('admin'), offersController.adminCreateOffer);
router.patch('/admin/:id/status', protect, restrictTo('admin'), offersController.adminUpdateStatus);
router.delete('/admin/:id', protect, restrictTo('admin'), offersController.adminDeleteOffer);
router.get('/admin/:id/redemptions', protect, restrictTo('admin'), offersController.adminGetRedemptions);

module.exports = router;
