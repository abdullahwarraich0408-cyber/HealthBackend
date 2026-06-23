const express = require('express');
const router = express.Router();
const hospitalsController = require('./hospitals.controller');

router.get('/', hospitalsController.getHospitals);
router.get('/:id', hospitalsController.getHospital);
router.get('/:id/doctors', hospitalsController.getHospitalDoctors);
router.get('/:id/specialties', hospitalsController.getHospitalSpecialties);

module.exports = router;
