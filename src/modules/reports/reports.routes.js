const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');

router.use(protect, restrictTo('admin', 'vendor'));

router.get('/', (req, res) => {
  res.json({ message: "Reports endpoint ready to be implemented" });
});

module.exports = router;
