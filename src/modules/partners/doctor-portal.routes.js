const express = require('express');
const router = express.Router();
const doctorPortalController = require('./doctor-portal.controller');
const { protect, restrictTo } = require('../../middleware/auth.middleware');

router.use(protect, restrictTo('doctor'));

router.get('/profile', doctorPortalController.getProfile);
router.patch('/profile', doctorPortalController.updateProfile);
router.patch('/password', doctorPortalController.updatePassword);
router.get('/appointments', doctorPortalController.getAppointments);
router.patch('/appointments/:id/status', doctorPortalController.updateAppointmentStatus);
router.get('/schedule', doctorPortalController.getSchedule);
router.put('/schedule', doctorPortalController.updateSchedule);
router.get('/hospitals', doctorPortalController.getHospitals);
router.get('/practice-locations', doctorPortalController.getPracticeLocations);
router.post('/practice-locations', doctorPortalController.createPracticeLocation);
router.patch('/practice-locations/:locationId', doctorPortalController.updatePracticeLocation);
router.delete('/practice-locations/:locationId', doctorPortalController.deletePracticeLocation);
router.get('/patients', doctorPortalController.getPatients);
router.get('/patients/:patientId', doctorPortalController.getPatient);
router.get('/stats', doctorPortalController.getStats);
router.post('/prescriptions', doctorPortalController.createPrescription);
router.get('/prescriptions/:appointmentId', doctorPortalController.getPrescription);
router.get('/appointments/:id/consultation', doctorPortalController.getConsultation);
router.patch('/appointments/:id/consultation', doctorPortalController.updateConsultation);
router.post('/lab-orders', doctorPortalController.orderLabTest);

module.exports = router;
