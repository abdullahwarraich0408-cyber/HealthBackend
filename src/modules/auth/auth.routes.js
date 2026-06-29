const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authValidator = require('./auth.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { authRateLimiter, otpRateLimiter } = require('../../middleware/rateLimit.middleware');
const { initFirebaseAdmin } = require('../../config/firebase');

initFirebaseAdmin();

router.post('/register', authRateLimiter, validate(authValidator.registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(authValidator.loginSchema), authController.login);
router.post('/partner/login', authRateLimiter, validate(authValidator.partnerLoginSchema), authController.partnerLogin);

router.post('/firebase', otpRateLimiter, validate(authValidator.firebaseAuthSchema), authController.firebaseLogin);
router.post('/google', authRateLimiter, validate(authValidator.googleAuthSchema), authController.googleLogin);
router.post('/apple', authRateLimiter, validate(authValidator.appleAuthSchema), authController.appleLogin);

if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_AUTH === 'true') {
  router.post('/dev-login', authRateLimiter, validate(authValidator.devLoginSchema), authController.devLogin);
}

router.post('/refresh', authRateLimiter, validate(authValidator.refreshSchema), authController.refresh);
router.post('/logout', protect, authController.logout);
router.post('/logout-all', protect, authController.logoutAll);

router.get('/me', protect, authController.me);
router.put('/profile', protect, validate(authValidator.updateProfileSchema), authController.updateProfile);
router.delete('/account', protect, authController.deleteAccount);

router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password/:token', authRateLimiter, authController.resetPassword);

module.exports = router;
