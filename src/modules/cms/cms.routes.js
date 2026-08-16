const express = require('express');
const router = express.Router();
const cmsController = require('./cms.controller');

router.get('/', cmsController.listPublic);

module.exports = router;
