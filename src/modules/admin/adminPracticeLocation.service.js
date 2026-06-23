const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const {
  mapPracticeLocation,
  practiceLocationInclude,
  normalizeLocationSchedule,
} = require('../../utils/practice-locations.utils');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_SLOT = '09:00 AM - 01:00 PM';

const parseMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildScheduleFromPayload = ({ days = [], slots = [DEFAULT_SLOT] }) => {
  const normalizedDays = Array.isArray(days)
    ? days.filter((day) => WEEKDAYS.includes(day))
    : [];

  if (!normalizedDays.length) {
    throw new AppError('Select at least one day for this hospital', 400);
  }

  const normalizedSlots = Array.isArray(slots)
    ? slots.map((slot) => String(slot).trim()).filter(Boolean)
    : [DEFAULT_SLOT];

  return normalizedDays.map((day) => ({
    day,
    slots: normalizedSlots.length ? normalizedSlots : [DEFAULT_SLOT],
  }));
};

const ensureDoctorExists = async (doctorId) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new AppError('Doctor not found', 404);
  return doctor;
};

const listPracticeLocations = async (doctorId) => {
  await ensureDoctorExists(doctorId);

  const locations = await prisma.doctorPracticeLocation.findMany({
    where: { doctor_id: doctorId },
    include: practiceLocationInclude,
    orderBy: { created_at: 'asc' },
  });

  return locations.map(mapPracticeLocation);
};

const createPracticeLocation = async (doctorId, payload) => {
  const doctor = await ensureDoctorExists(doctorId);
  const { hospital_id, clinic_name, address, fee, days, slots, is_active = true } = payload;

  if (!hospital_id && !clinic_name?.trim()) {
    throw new AppError('Select a hospital or enter a clinic name', 400);
  }

  let hospital = null;
  if (hospital_id) {
    hospital = await prisma.hospital.findUnique({ where: { id: hospital_id } });
    if (!hospital) throw new AppError('Hospital not found', 400);
  }

  const schedule = buildScheduleFromPayload({ days, slots });

  const location = await prisma.doctorPracticeLocation.create({
    data: {
      doctor_id: doctorId,
      hospital_id: hospital?.id || null,
      clinic_name: clinic_name?.trim() || null,
      address: address?.trim() || null,
      fee: parseMoney(fee) ?? doctor.fee,
      schedule,
      is_active: Boolean(is_active),
    },
    include: practiceLocationInclude,
  });

  return mapPracticeLocation(location);
};

const updatePracticeLocation = async (doctorId, locationId, payload) => {
  await ensureDoctorExists(doctorId);

  const existing = await prisma.doctorPracticeLocation.findFirst({
    where: { id: locationId, doctor_id: doctorId },
  });
  if (!existing) throw new AppError('Practice location not found', 404);

  const data = {};

  if (payload.hospital_id !== undefined) {
    if (payload.hospital_id) {
      const hospital = await prisma.hospital.findUnique({ where: { id: payload.hospital_id } });
      if (!hospital) throw new AppError('Hospital not found', 400);
      data.hospital_id = hospital.id;
    } else {
      data.hospital_id = null;
    }
  }

  if (payload.clinic_name !== undefined) data.clinic_name = payload.clinic_name?.trim() || null;
  if (payload.address !== undefined) data.address = payload.address?.trim() || null;
  if (payload.fee !== undefined) data.fee = parseMoney(payload.fee);
  if (payload.is_active !== undefined) data.is_active = Boolean(payload.is_active);

  if (payload.days || payload.slots) {
    const currentSchedule = normalizeLocationSchedule(existing.schedule);
    const currentDays = currentSchedule.filter((entry) => entry.slots?.length).map((entry) => entry.day);
    const currentSlots = currentSchedule.find((entry) => entry.slots?.length)?.slots || [DEFAULT_SLOT];
    data.schedule = buildScheduleFromPayload({
      days: payload.days || currentDays,
      slots: payload.slots || currentSlots,
    });
  }

  const location = await prisma.doctorPracticeLocation.update({
    where: { id: locationId },
    data,
    include: practiceLocationInclude,
  });

  return mapPracticeLocation(location);
};

const deletePracticeLocation = async (doctorId, locationId) => {
  await ensureDoctorExists(doctorId);

  const existing = await prisma.doctorPracticeLocation.findFirst({
    where: { id: locationId, doctor_id: doctorId },
  });
  if (!existing) throw new AppError('Practice location not found', 404);

  await prisma.doctorPracticeLocation.delete({ where: { id: locationId } });
  return { id: locationId };
};

module.exports = {
  WEEKDAYS,
  DEFAULT_SLOT,
  listPracticeLocations,
  createPracticeLocation,
  updatePracticeLocation,
  deletePracticeLocation,
};
