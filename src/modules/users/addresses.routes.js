const express = require('express');
const router = express.Router();
const addressesController = require('./addresses.controller');
const usersValidator = require('./users.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

router.use(protect);
router.use(restrictTo('customer')); // addresses are customer-specific

// GET /api/addresses – customer saved addresses
router.get('/', addressesController.getAddresses);

// POST /api/addresses – add new address
router.post('/', validate(usersValidator.addAddressSchema), addressesController.addAddress);

// PUT /api/addresses/:id – edit address
router.put('/:id', validate(usersValidator.editAddressSchema), addressesController.editAddress);

// DELETE /api/addresses/:id – delete address
router.delete('/:id', addressesController.deleteAddress);

module.exports = router;
