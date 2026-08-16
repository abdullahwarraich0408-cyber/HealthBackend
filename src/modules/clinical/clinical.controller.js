const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const clinicalService = require('./clinical.service');

const getConsultation = catchAsync(async (req, res) => {
  const data = await clinicalService.getConsultationByAppointment(req.user.id, req.params.id);
  sendResponse(res, 200, data, 'Consultation fetched');
});

const updateConsultation = catchAsync(async (req, res) => {
  const consultation = await clinicalService.updateConsultation(
    req.user.id,
    req.params.id,
    req.body
  );
  sendResponse(res, 200, { consultation }, 'Consultation updated');
});

const getPatient = catchAsync(async (req, res) => {
  const data = await clinicalService.getPatientClinicalHistory(req.user.id, req.params.patientId);
  sendResponse(res, 200, data, 'Patient clinical history fetched');
});

const savePrescription = catchAsync(async (req, res) => {
  const prescription = await clinicalService.savePrescription(req.user.id, req.body);
  sendResponse(res, 201, { prescription }, 'Prescription saved');
});

const orderLabTest = catchAsync(async (req, res) => {
  const booking = await clinicalService.orderLabTest(req.user.id, req.body);
  sendResponse(res, 201, { booking }, 'Lab test ordered');
});

const listDocuments = catchAsync(async (req, res) => {
  const documents = await clinicalService.listMedicalDocuments(req.user.id, req.query);
  sendResponse(res, 200, { documents }, 'Health documents fetched');
});

const createDocument = catchAsync(async (req, res) => {
  const document = await clinicalService.createMedicalDocument(req.user.id, req.body);
  sendResponse(res, 201, { document }, 'Document saved to health record');
});

const deleteDocument = catchAsync(async (req, res) => {
  const result = await clinicalService.deleteMedicalDocument(req.user.id, req.params.id);
  sendResponse(res, 200, result, 'Document removed');
});

const getTimeline = catchAsync(async (req, res) => {
  const timeline = await clinicalService.getHealthTimeline(req.user.id);
  sendResponse(res, 200, { timeline }, 'Health timeline fetched');
});

module.exports = {
  getConsultation,
  updateConsultation,
  getPatient,
  savePrescription,
  orderLabTest,
  listDocuments,
  createDocument,
  deleteDocument,
  getTimeline,
};
