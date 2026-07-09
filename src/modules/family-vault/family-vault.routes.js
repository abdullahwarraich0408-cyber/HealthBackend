const express = require('express');
const router = express.Router();
const controller = require('./family-vault.controller');
const validator = require('./family-vault.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect, restrictTo } = require('../../middleware/auth.middleware');

router.use(protect, restrictTo('customer'));

router.post('/', validate(validator.createFamilySchema), controller.createFamily);
router.get('/', controller.getFamily);
router.patch('/', validate(validator.updateFamilySchema), controller.updateFamily);

router.get('/dashboard', controller.getDashboard);
router.get('/calendar', controller.getCalendar);
router.get('/ai-insights', controller.getAiInsights);
router.get('/weekly-summary', controller.getWeeklySummary);
router.post('/copilot', validate(validator.copilotQuerySchema), controller.copilotQuery);
router.get('/search', controller.searchTimeline);

router.post('/members', validate(validator.createMemberSchema), controller.addMember);
router.get('/members/:memberId', validate(validator.memberIdParam), controller.getMember);
router.patch('/members/:memberId', validate(validator.updateMemberSchema), controller.updateMember);
router.delete('/members/:memberId', validate(validator.memberIdParam), controller.deleteMember);
router.get('/members/:memberId/emergency', validate(validator.memberIdParam), controller.getEmergencyProfile);

router.post('/members/:memberId/timeline', validate(validator.timelineSchema), controller.addTimelineEvent);
router.post('/members/:memberId/medicines', validate(validator.medicineSchema), controller.addMedicine);
router.post('/members/:memberId/lab-reports', validate(validator.labReportSchema), controller.addLabReport);
router.post('/members/:memberId/vaccinations', validate(validator.vaccinationSchema), controller.addVaccination);
router.post('/members/:memberId/vitals', validate(validator.vitalSchema), controller.addVital);
router.post('/members/:memberId/doctors', validate(validator.doctorSchema), controller.addDoctor);
router.post('/members/:memberId/appointments', validate(validator.appointmentSchema), controller.addAppointment);
router.post('/members/:memberId/prescriptions', validate(validator.prescriptionSchema), controller.addPrescription);
router.delete(
  '/members/:memberId/prescriptions/:prescriptionId',
  validate(validator.prescriptionIdParam),
  controller.deletePrescription,
);

module.exports = router;
