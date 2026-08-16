const express = require('express');
const router = express.Router();
const homeSlidesController = require('./homeSlides.controller');

router.get('/', homeSlidesController.listPublic);

module.exports = router;
