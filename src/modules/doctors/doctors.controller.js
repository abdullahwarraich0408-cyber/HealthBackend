const catchAsync = require('../../utils/catchAsync');
const doctorsService = require('./doctors.service');
const { sendResponse } = require('../../utils/response');

const getFilters = catchAsync(async (req, res) => {
  const filters = await doctorsService.getFilters();
  sendResponse(res, 200, { filters }, 'Doctor filter options fetched successfully');
});

const getDoctors = catchAsync(async (req, res) => {
  const doctors = await doctorsService.getDoctors(req.query);
  sendResponse(res, 200, { doctors }, 'Doctors fetched successfully');
});

const getDoctor = catchAsync(async (req, res) => {
  const doctor = await doctorsService.getDoctorById(req.params.id);
  sendResponse(res, 200, { doctor }, 'Doctor fetched successfully');
});

const getDoctorReviews = catchAsync(async (req, res) => {
  const reviews = await doctorsService.getDoctorReviews(req.params.id);
  sendResponse(res, 200, { reviews }, 'Doctor reviews fetched successfully');
});

const getDoctorSlots = catchAsync(async (req, res) => {
  const availability = await doctorsService.getDoctorSlots(
    req.params.id,
    req.query.date,
    req.query
  );
  sendResponse(res, 200, availability, 'Doctor slots fetched successfully');
});

const getDoctorPracticeLocations = catchAsync(async (req, res) => {
  const locations = await doctorsService.getDoctorPracticeLocations(req.params.id);
  sendResponse(res, 200, { locations }, 'Practice locations fetched successfully');
});

const bookAppointment = catchAsync(async (req, res) => {
  const appointment = await doctorsService.bookAppointment(req.user.id, req.body);
  sendResponse(res, 201, { appointment }, 'Appointment booked successfully');
});

const getMyAppointments = catchAsync(async (req, res) => {
  const appointments = await doctorsService.getCustomerAppointments(req.user.id);
  sendResponse(res, 200, { appointments }, 'Appointments fetched successfully');
});

const getMyAppointment = catchAsync(async (req, res) => {
  const appointment = await doctorsService.getCustomerAppointmentById(req.user.id, req.params.id);
  sendResponse(res, 200, { appointment }, 'Appointment fetched successfully');
});

const cancelAppointment = catchAsync(async (req, res) => {
  const appointment = await doctorsService.cancelAppointment(req.user.id, req.params.id);
  sendResponse(res, 200, { appointment }, 'Appointment cancelled successfully');
});

const updateAppointment = catchAsync(async (req, res) => {
  const appointment = await doctorsService.updateAppointment(req.user.id, req.params.id, req.body);
  sendResponse(res, 200, { appointment }, 'Appointment updated successfully');
});

const joinConsultation = catchAsync(async (req, res) => {
  const appointment = await doctorsService.joinConsultation(req.user.id, req.params.id);
  sendResponse(res, 200, { appointment }, 'Consultation joined successfully');
});

const selectConsultationMode = catchAsync(async (req, res) => {
  const appointment = await doctorsService.selectConsultationMode(
    req.user.id,
    req.params.id,
    req.body.mode
  );
  sendResponse(res, 200, { appointment }, 'Consultation type selected successfully');
});

const getConsultation = catchAsync(async (req, res) => {
  const appointment = await doctorsService.getConsultationByMeetingId(req.params.meetingId, req.user);
  sendResponse(res, 200, { appointment }, 'Consultation fetched successfully');
});

const submitDoctorReview = catchAsync(async (req, res) => {
  const review = await doctorsService.submitDoctorReview(req.user.id, req.params.id, req.body);
  sendResponse(res, 201, { review }, 'Review submitted successfully');
});

const updateDoctorSlots = catchAsync(async (req, res) => {
  const doctor = await doctorsService.updateDoctorSlots(req.user.id, req.params.id, req.body.slots);
  sendResponse(res, 200, { doctor }, 'Doctor slots updated successfully');
});

module.exports = {
  getFilters,
  getDoctors,
  getDoctor,
  getDoctorReviews,
  getDoctorPracticeLocations,
  getDoctorSlots,
  bookAppointment,
  getMyAppointments,
  getMyAppointment,
  cancelAppointment,
  updateAppointment,
  joinConsultation,
  selectConsultationMode,
  getConsultation,
  submitDoctorReview,
  updateDoctorSlots,
};
