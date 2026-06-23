const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const labTestsService = require('../lab-tests/labTests.service');

const sanitizeLab = (lab) => {
  const copy = { ...lab };
  delete copy.password;
  return copy;
};

const getProfile = async (labId) => {
  const lab = await prisma.labPartner.findUnique({ where: { id: labId } });
  if (!lab) throw new AppError('Lab partner not found', 404);
  return sanitizeLab(lab);
};

const updateProfile = async (labId, data) => {
  const allowed = {
    name: data.name,
    phone: data.phone,
    address: data.address,
    city: data.city,
    license_number: data.license,
    bio: data.bio,
    operating_hours: data.operatingHours,
    collection_areas: data.collectionAreas,
    home_collection: data.homeCollection,
    notification_preferences: data.notification_preferences,
  };

  Object.keys(allowed).forEach((key) => allowed[key] === undefined && delete allowed[key]);

  const lab = await prisma.labPartner.update({
    where: { id: labId },
    data: allowed,
  });

  return sanitizeLab(lab);
};

const updatePassword = async (labId, currentPassword, newPassword) => {
  const lab = await prisma.labPartner.findUnique({ where: { id: labId } });
  if (!lab) throw new AppError('Lab partner not found', 404);

  const { comparePassword, hashPassword } = require('../auth/auth.helper');
  const match = await comparePassword(currentPassword, lab.password);
  if (!match) throw new AppError('Current password is incorrect', 400);

  await prisma.labPartner.update({
    where: { id: labId },
    data: { password: await hashPassword(newPassword) },
  });
};

const getBookings = async (labId) => labTestsService.getLabBookings(labId);

const updateBookingStatus = async (labId, bookingId, status, note) =>
  labTestsService.updateBookingStatus(labId, bookingId, status, note);

const uploadReport = async (labId, bookingId, reportUrl) =>
  labTestsService.uploadReport(labId, bookingId, reportUrl);

const assignCollector = async (labId, bookingId, payload) =>
  labTestsService.assignCollector(labId, bookingId, payload);

const getTests = async (labId) =>
  prisma.labTest.findMany({
    where: { lab_partner_id: labId },
    orderBy: { name: 'asc' },
  });

const createTest = async (labId, data) => {
  const lab = await prisma.labPartner.findUnique({ where: { id: labId } });
  if (!lab) throw new AppError('Lab partner not found', 404);

  return prisma.labTest.create({
    data: {
      lab_partner_id: labId,
      lab: lab.name,
      name: data.name,
      category: data.category,
      price: Number(data.price),
      report_time: data.turnaround || data.report_time || '24 hrs',
      collection_time: data.collection_time || '30 min',
      tests_included: Number(data.tests_included || 1),
      home_collection: data.home_collection ?? lab.home_collection,
      fasting_required: data.fasting_required ?? false,
      preparation: data.preparation,
      is_active: data.status !== 'inactive',
      description: data.description,
    },
  });
};

const updateTest = async (labId, testId, data) => {
  const existing = await prisma.labTest.findFirst({
    where: { id: testId, lab_partner_id: labId },
  });
  if (!existing) throw new AppError('Test not found', 404);

  return prisma.labTest.update({
    where: { id: testId },
    data: {
      name: data.name,
      category: data.category,
      price: data.price !== undefined ? Number(data.price) : undefined,
      report_time: data.turnaround || data.report_time,
      collection_time: data.collection_time,
      fasting_required: data.fasting_required,
      preparation: data.preparation,
      is_active: data.status ? data.status === 'active' : undefined,
      description: data.description,
    },
  });
};

const deleteTest = async (labId, testId) => {
  const existing = await prisma.labTest.findFirst({
    where: { id: testId, lab_partner_id: labId },
  });
  if (!existing) throw new AppError('Test not found', 404);

  await prisma.labTest.update({
    where: { id: testId },
    data: { is_active: false },
  });
};

const getReportsSummary = async (labId) => {
  const bookings = await prisma.labTestBooking.findMany({
    where: { lab_partner_id: labId },
    include: { lab_test: { select: { name: true } } },
  });

  const totalBookings = bookings.length;
  const completedTests = bookings.filter((b) =>
    ['completed', 'report_uploaded'].includes(b.status)
  ).length;
  const revenue = bookings
    .filter((b) => !['cancelled', 'rejected'].includes(b.status))
    .reduce((sum, b) => sum + (b.price || 0), 0);
  const pendingReports = bookings.filter((b) =>
    ['sample_collected', 'testing', 'confirmed', 'collector_assigned'].includes(b.status)
  ).length;

  const testCounts = {};
  for (const booking of bookings) {
    const name = booking.lab_test?.name || 'Unknown';
    if (!testCounts[name]) testCounts[name] = { name, count: 0, revenue: 0 };
    testCounts[name].count += 1;
    testCounts[name].revenue += booking.price || 0;
  }

  const topTests = Object.values(testCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalBookings,
    completedTests,
    revenue,
    avgTurnaround: '22 hrs',
    pendingReports,
    topTests,
  };
};

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  getBookings,
  updateBookingStatus,
  uploadReport,
  assignCollector,
  getTests,
  createTest,
  updateTest,
  deleteTest,
  getReportsSummary,
};
