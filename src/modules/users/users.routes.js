const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const usersValidator = require('./users.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');

router.use(protect); // All user routes require authentication

const addressesController = require('./addresses.controller');

router.get('/profile', usersController.getProfile);
router.patch('/profile', validate(usersValidator.updateProfileSchema), usersController.updateProfile);
router.post('/password', validate(usersValidator.changePasswordSchema), usersController.changePassword);

router.get('/addresses', addressesController.getAddresses);
router.post('/addresses', addressesController.addAddress);
router.delete('/addresses/:id', addressesController.deleteAddress);

module.exports = router;
