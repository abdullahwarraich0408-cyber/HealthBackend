const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const familyVaultService = require('./family-vault.service');

exports.createFamily = catchAsync(async (req, res) => {
  const data = await familyVaultService.createFamily(req.user.id, req.body);
  sendResponse(res, 201, { vault: data }, 'Family health vault created');
});

exports.getFamily = catchAsync(async (req, res) => {
  const data = await familyVaultService.getFamily(req.user.id);
  sendResponse(res, 200, { vault: data }, data ? 'Family vault loaded' : 'No family vault yet');
});

exports.updateFamily = catchAsync(async (req, res) => {
  const data = await familyVaultService.updateFamily(req.user.id, req.body);
  sendResponse(res, 200, { vault: data }, 'Family vault updated');
});

exports.addMember = catchAsync(async (req, res) => {
  const data = await familyVaultService.addMember(req.user.id, req.body);
  sendResponse(res, 201, { member: data }, 'Family member added');
});

exports.updateMember = catchAsync(async (req, res) => {
  const data = await familyVaultService.updateMember(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 200, { member: data }, 'Family member updated');
});

exports.deleteMember = catchAsync(async (req, res) => {
  await familyVaultService.deleteMember(req.user.id, req.params.memberId);
  sendResponse(res, 200, { deleted: true }, 'Family member removed');
});

exports.getMember = catchAsync(async (req, res) => {
  const data = await familyVaultService.getMember(req.user.id, req.params.memberId);
  sendResponse(res, 200, { member: data }, 'Member profile loaded');
});

exports.addTimelineEvent = catchAsync(async (req, res) => {
  const data = await familyVaultService.addTimelineEvent(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { event: data }, 'Timeline event added');
});

exports.addMedicine = catchAsync(async (req, res) => {
  const data = await familyVaultService.addMedicine(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { medicine: data }, 'Medicine added');
});

exports.addLabReport = catchAsync(async (req, res) => {
  const data = await familyVaultService.addLabReport(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { labReport: data }, 'Lab report added');
});

exports.addVaccination = catchAsync(async (req, res) => {
  const data = await familyVaultService.addVaccination(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { vaccination: data }, 'Vaccination recorded');
});

exports.addVital = catchAsync(async (req, res) => {
  const data = await familyVaultService.addVital(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { vital: data }, 'Vital recorded');
});

exports.addDoctor = catchAsync(async (req, res) => {
  const data = await familyVaultService.addDoctor(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { doctor: data }, 'Doctor added');
});

exports.addAppointment = catchAsync(async (req, res) => {
  const data = await familyVaultService.addAppointment(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { appointment: data }, 'Appointment recorded');
});

exports.addPrescription = catchAsync(async (req, res) => {
  const data = await familyVaultService.addPrescription(req.user.id, req.params.memberId, req.body);
  sendResponse(res, 201, { prescription: data }, 'Prescription uploaded');
});

exports.deletePrescription = catchAsync(async (req, res) => {
  const data = await familyVaultService.deletePrescription(
    req.user.id,
    req.params.memberId,
    req.params.prescriptionId,
  );
  sendResponse(res, 200, data, 'Prescription removed');
});

exports.getDashboard = catchAsync(async (req, res) => {
  const data = await familyVaultService.getDashboard(req.user.id);
  sendResponse(res, 200, data, 'Family dashboard loaded');
});

exports.getCalendar = catchAsync(async (req, res) => {
  const data = await familyVaultService.getCalendar(req.user.id, req.query);
  sendResponse(res, 200, data, 'Calendar loaded');
});

exports.getAiInsights = catchAsync(async (req, res) => {
  const data = await familyVaultService.getAiInsights(req.user.id);
  sendResponse(res, 200, data, 'AI insights loaded');
});

exports.getWeeklySummary = catchAsync(async (req, res) => {
  const data = await familyVaultService.getWeeklySummary(req.user.id);
  sendResponse(res, 200, data, 'Weekly summary loaded');
});

exports.copilotQuery = catchAsync(async (req, res) => {
  const data = await familyVaultService.copilotQuery(req.user.id, req.body.question);
  sendResponse(res, 200, data, 'Copilot response');
});

exports.searchTimeline = catchAsync(async (req, res) => {
  const data = await familyVaultService.searchTimeline(req.user.id, req.query.q || '');
  sendResponse(res, 200, data, 'Search results');
});

exports.getEmergencyProfile = catchAsync(async (req, res) => {
  const data = await familyVaultService.getEmergencyProfile(req.user.id, req.params.memberId);
  sendResponse(res, 200, data, 'Emergency profile loaded');
});
