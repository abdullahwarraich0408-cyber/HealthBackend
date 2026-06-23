const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const doctorPortalService = require('./doctor-portal.service');

const getProfile = catchAsync(async (req, res) => {
  const doctor = await doctorPortalService.getProfile(req.user.id);
  sendResponse(res, 200, { doctor }, 'Doctor profile fetched');
});

const updateProfile = catchAsync(async (req, res) => {
  const doctor = await doctorPortalService.updateProfile(req.user.id, req.body);
  sendResponse(res, 200, { doctor }, 'Doctor profile updated');
});

const updatePassword = catchAsync(async (req, res) => {
  await doctorPortalService.updatePassword(req.user.id, req.body.current, req.body.new);
  sendResponse(res, 200, null, 'Password updated successfully');
});

const getAppointments = catchAsync(async (req, res) => {
  const appointments = await doctorPortalService.getAppointments(req.user.id);
  sendResponse(res, 200, { appointments }, 'Appointments fetched');
});

const updateAppointmentStatus = catchAsync(async (req, res) => {
  const appointment = await doctorPortalService.updateAppointmentStatus(
    req.user.id,
    req.params.id,
    req.body.status,
    req.body.notes
  );
  sendResponse(res, 200, { appointment }, 'Appointment updated');
});

const getSchedule = catchAsync(async (req, res) => {
  const schedule = await doctorPortalService.getSchedule(req.user.id);
  sendResponse(res, 200, { schedule }, 'Schedule fetched');
});

const updateSchedule = catchAsync(async (req, res) => {
  const doctor = await doctorPortalService.updateSchedule(req.user.id, req.body.slots);
  sendResponse(res, 200, { doctor, schedule: req.body.slots }, 'Schedule updated');
});

const getPatients = catchAsync(async (req, res) => {
  const patients = await doctorPortalService.getPatients(req.user.id);
  sendResponse(res, 200, { patients }, 'Patients fetched');
});

const getStats = catchAsync(async (req, res) => {
  const stats = await doctorPortalService.getStats(req.user.id);
  sendResponse(res, 200, { stats }, 'Stats fetched');
});

const createPrescription = catchAsync(async (req, res) => {
  const prescription = await doctorPortalService.createPrescription(req.user.id, req.body);
  sendResponse(res, 201, { prescription }, 'Prescription saved');
});

const getPrescription = catchAsync(async (req, res) => {
  const prescription = await doctorPortalService.getPrescription(req.user.id, req.params.appointmentId);
  sendResponse(res, 200, { prescription }, 'Prescription fetched');
});

const getHospitals = catchAsync(async (req, res) => {
  const hospitals = await doctorPortalService.getHospitals();
  sendResponse(res, 200, { hospitals }, 'Hospitals fetched');
});

const getPracticeLocations = catchAsync(async (req, res) => {
  const locations = await doctorPortalService.listPracticeLocations(req.user.id);
  sendResponse(res, 200, { locations }, 'Practice locations fetched');
});

const createPracticeLocation = catchAsync(async (req, res) => {
  const location = await doctorPortalService.createPracticeLocation(req.user.id, req.body);
  sendResponse(res, 201, { location }, 'Practice location created');
});

const updatePracticeLocation = catchAsync(async (req, res) => {
  const location = await doctorPortalService.updatePracticeLocation(
    req.user.id,
    req.params.locationId,
    req.body
  );
  sendResponse(res, 200, { location }, 'Practice location updated');
});

const deletePracticeLocation = catchAsync(async (req, res) => {
  const result = await doctorPortalService.deletePracticeLocation(req.user.id, req.params.locationId);
  sendResponse(res, 200, result, 'Practice location removed');
});

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  getAppointments,
  updateAppointmentStatus,
  getSchedule,
  updateSchedule,
  getPatients,
  getStats,
  createPrescription,
  getPrescription,
  getHospitals,
  getPracticeLocations,
  createPracticeLocation,
  updatePracticeLocation,
  deletePracticeLocation,
};
