const catchAsync = require('../../utils/catchAsync');
const hospitalsService = require('./hospitals.service');
const { sendResponse } = require('../../utils/response');

const getHospitals = catchAsync(async (req, res) => {
  const hospitals = await hospitalsService.getHospitals(req.query);
  sendResponse(res, 200, { hospitals }, 'Hospitals fetched successfully');
});

const getHospital = catchAsync(async (req, res) => {
  const hospital = await hospitalsService.getHospitalById(req.params.id);
  sendResponse(res, 200, { hospital }, 'Hospital fetched successfully');
});

const getHospitalDoctors = catchAsync(async (req, res) => {
  const result = await hospitalsService.getHospitalDoctors(req.params.id, req.query);
  sendResponse(
    res,
    200,
    {
      hospital: result.hospital,
      doctors: result.doctors,
      specialties: result.specialties,
    },
    'Hospital doctors fetched successfully'
  );
});

const getHospitalSpecialties = catchAsync(async (req, res) => {
  const specialties = await hospitalsService.getHospitalSpecialties(req.params.id);
  sendResponse(res, 200, { specialties }, 'Hospital specialties fetched successfully');
});

const createHospital = catchAsync(async (req, res) => {
  const hospital = await hospitalsService.createHospital(req.body, req.user?.id);
  sendResponse(res, 201, { hospital }, 'Hospital created successfully');
});

const updateHospital = catchAsync(async (req, res) => {
  const hospital = await hospitalsService.updateHospital(req.params.id, req.body);
  sendResponse(res, 200, { hospital }, 'Hospital updated successfully');
});

const setHospitalStatus = catchAsync(async (req, res) => {
  const hospital = await hospitalsService.setHospitalStatus(
    req.params.id,
    req.body.is_active,
    req.user?.id
  );
  sendResponse(res, 200, { hospital }, 'Hospital status updated successfully');
});

const deleteHospital = catchAsync(async (req, res) => {
  await hospitalsService.deleteHospital(req.params.id, req.user?.id);
  sendResponse(res, 200, null, 'Hospital deleted successfully');
});

const listAdminHospitals = catchAsync(async (req, res) => {
  const hospitals = await hospitalsService.listAdminHospitals();
  sendResponse(res, 200, { hospitals }, 'Hospitals fetched successfully');
});

module.exports = {
  getHospitals,
  getHospital,
  getHospitalDoctors,
  getHospitalSpecialties,
  createHospital,
  updateHospital,
  setHospitalStatus,
  deleteHospital,
  listAdminHospitals,
};
