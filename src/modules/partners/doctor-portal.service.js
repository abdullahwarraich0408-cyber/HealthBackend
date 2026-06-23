const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const {
  normalizeWeeklySchedule,
  normalizeTimeRange,
  generateMeetingRoom,
  assertStatusTransition,
} = require('../../utils/telehealth.utils');
const {
  notifyAppointmentConfirmed,
  notifyAppointmentCompleted,
} = require('../../utils/telehealth.notifications');
const {
  createChatForAppointment,
  extendChatAfterCompletion,
  createSystemMessage,
} = require('../telehealth/telehealth.chat.service');
const { activateConsultationMode } = require('../telehealth/consultation-mode.service');
const adminPracticeLocationService = require('../admin/adminPracticeLocation.service');

const sanitizeDoctor = (doctor) => {
  const copy = { ...doctor };
  delete copy.password;
  return copy;
};

const appointmentInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  prescription: true,
};

const getProfile = async (doctorId) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { account: { select: { email: true } } },
  });
  if (!doctor) throw new AppError('Doctor not found', 404);
  return sanitizeDoctor({
    ...doctor,
    email: doctor.account?.email || doctor.email,
  });
};

const updateProfile = async (doctorId, data) => {
  const allowed = {
    name: data.name,
    phone: data.phone,
    about: data.about,
    specialty: data.specialty,
    hospital: data.hospital,
    fee: data.fee !== undefined ? Number(data.fee) : undefined,
    experience_years: data.experience_years !== undefined ? Number(data.experience_years) : undefined,
    languages: data.languages,
    qualifications: data.qualifications,
    photo_url: data.photo_url,
    notification_preferences: data.notification_preferences,
  };

  Object.keys(allowed).forEach((key) => allowed[key] === undefined && delete allowed[key]);

  if (typeof allowed.languages === 'string') {
    allowed.languages = allowed.languages.split(',').map((l) => l.trim()).filter(Boolean);
  }

  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: allowed,
    include: { account: { select: { email: true } } },
  });

  return sanitizeDoctor({
    ...doctor,
    email: doctor.account?.email || doctor.email,
  });
};

const updatePassword = async (doctorId, currentPassword, newPassword) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { account: true },
  });
  if (!doctor?.account?.password && !doctor?.password) {
    throw new AppError('Unable to update password', 400);
  }

  const { comparePassword, hashPassword } = require('../auth/auth.helper');
  const storedPassword = doctor.account?.password || doctor.password;
  const match = await comparePassword(currentPassword, storedPassword);
  if (!match) throw new AppError('Current password is incorrect', 400);

  const hashed = await hashPassword(newPassword);
  if (doctor.account_id) {
    await prisma.account.update({
      where: { id: doctor.account_id },
      data: { password: hashed },
    });
  } else {
    await prisma.doctor.update({
      where: { id: doctorId },
      data: { password: hashed },
    });
  }
};

const getAppointments = async (doctorId) => {
  return prisma.doctorAppointment.findMany({
    where: { doctor_id: doctorId },
    include: appointmentInclude,
    orderBy: { appointment_date: 'desc' },
  });
};

const updateAppointmentStatus = async (doctorId, appointmentId, status, notes) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, doctor_id: doctorId },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      doctor: { include: { account: { select: { email: true } } } },
    },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);

  assertStatusTransition(appointment.status, status);

  const updateData = { status };
  if (notes !== undefined) updateData.consultation_notes = notes;

  if (status === 'confirmed') {
    let updated = await prisma.doctorAppointment.update({
      where: { id: appointmentId },
      data: updateData,
      include: appointmentInclude,
    });

    if (updated.preferred_consultation_mode && !updated.consultation_mode) {
      updated = await activateConsultationMode(appointmentId, updated.preferred_consultation_mode);
    }

    await notifyAppointmentConfirmed({
      doctorEmail: appointment.doctor.account?.email || appointment.doctor.email,
      patientEmail: appointment.customer?.email,
      appointment: updated,
    });

    return updated;
  }

  if (status === 'in_progress') {
    if (!appointment.meeting_id && appointment.consultation_mode === 'online') {
      const meeting = generateMeetingRoom(appointment.id);
      updateData.meeting_id = meeting.meeting_id;
      updateData.meeting_url = meeting.meeting_url;
    }
  }

  const updated = await prisma.doctorAppointment.update({
    where: { id: appointmentId },
    data: updateData,
    include: appointmentInclude,
  });

  if (status === 'completed') {
    await extendChatAfterCompletion(appointmentId);
    await createSystemMessage(
      appointmentId,
      'Consultation completed. Chat stays open for 72 hours for follow-up questions.'
    );
    await notifyAppointmentCompleted({
      patientEmail: appointment.customer?.email,
      appointment: updated,
    });
  }

  return updated;
};

const updateSchedule = async (doctorId, slots) => {
  const normalized = normalizeWeeklySchedule(slots).map((entry) => ({
    ...entry,
    slots: Array.isArray(entry.slots)
      ? entry.slots.map((range) => normalizeTimeRange(range)).filter(Boolean)
      : [],
  }));

  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: { slots: normalized },
  });
  return sanitizeDoctor(doctor);
};

const getSchedule = async (doctorId) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new AppError('Doctor not found', 404);
  return normalizeWeeklySchedule(doctor.slots);
};

const getPatients = async (doctorId) => {
  const appointments = await prisma.doctorAppointment.findMany({
    where: { doctor_id: doctorId },
    include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { appointment_date: 'desc' },
  });

  const map = new Map();
  for (const apt of appointments) {
    if (!map.has(apt.customer_id)) {
      map.set(apt.customer_id, {
        id: apt.customer.id,
        name: apt.customer.name,
        email: apt.customer.email,
        phone: apt.customer.phone,
        lastVisit: apt.appointment_date,
        condition: apt.reason || apt.status,
        appointmentsCount: 1,
      });
    } else {
      const existing = map.get(apt.customer_id);
      existing.appointmentsCount += 1;
    }
  }

  return Array.from(map.values());
};

const getStats = async (doctorId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const appointments = await prisma.doctorAppointment.findMany({
    where: { doctor_id: doctorId },
    select: {
      status: true,
      fee: true,
      payment_status: true,
      appointment_date: true,
      customer_id: true,
    },
  });

  const todayAppointments = appointments.filter((item) => {
    const date = new Date(item.appointment_date);
    return date >= today && date < tomorrow && item.status !== 'cancelled';
  }).length;

  const totalPatients = new Set(appointments.map((item) => item.customer_id)).size;
  const pendingReviews = appointments.filter((item) => item.status === 'pending').length;
  const upcomingAppointments = appointments.filter((item) =>
    ['pending', 'confirmed'].includes(item.status) && new Date(item.appointment_date) >= today
  ).length;
  const completedAppointments = appointments.filter((item) => item.status === 'completed').length;
  const videoConsultations = appointments.filter((item) =>
    ['confirmed', 'in_progress', 'completed'].includes(item.status)
  ).length;
  const revenue = appointments
    .filter((item) => item.status === 'completed' && item.payment_status === 'paid')
    .reduce((sum, item) => sum + item.fee, 0);

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    select: { rating: true, reviews_count: true },
  });

  return {
    todayAppointments,
    totalPatients,
    videoConsultations,
    pendingReviews,
    upcomingAppointments,
    completedAppointments,
    revenue,
    rating: doctor?.rating || 0,
    reviewsCount: doctor?.reviews_count || 0,
  };
};

const createPrescription = async (doctorId, data) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: data.appointment_id, doctor_id: doctorId },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);
  if (!['in_progress', 'completed'].includes(appointment.status)) {
    throw new AppError('Prescription can only be created during or after consultation', 400);
  }

  const existing = await prisma.doctorPrescription.findUnique({
    where: { appointment_id: appointment.id },
  });
  if (existing) {
    return prisma.doctorPrescription.update({
      where: { id: existing.id },
      data: {
        items: data.items,
        notes: data.notes || null,
      },
    });
  }

  return prisma.doctorPrescription.create({
    data: {
      appointment_id: appointment.id,
      doctor_id: doctorId,
      customer_id: appointment.customer_id,
      items: data.items,
      notes: data.notes || null,
    },
  });
};

const getPrescription = async (doctorId, appointmentId) => {
  const prescription = await prisma.doctorPrescription.findFirst({
    where: {
      appointment_id: appointmentId,
      doctor_id: doctorId,
    },
  });
  if (!prescription) throw new AppError('Prescription not found', 404);
  return prescription;
};

const getHospitals = async () =>
  prisma.hospital.findMany({
    where: { is_active: true },
    select: { id: true, name: true, city: true, address: true },
    orderBy: { name: 'asc' },
  });

const listPracticeLocations = (doctorId) =>
  adminPracticeLocationService.listPracticeLocations(doctorId);

const createPracticeLocation = (doctorId, payload) =>
  adminPracticeLocationService.createPracticeLocation(doctorId, payload);

const updatePracticeLocation = (doctorId, locationId, payload) =>
  adminPracticeLocationService.updatePracticeLocation(doctorId, locationId, payload);

const deletePracticeLocation = (doctorId, locationId) =>
  adminPracticeLocationService.deletePracticeLocation(doctorId, locationId);

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  getAppointments,
  updateAppointmentStatus,
  updateSchedule,
  getSchedule,
  getPatients,
  getStats,
  createPrescription,
  getPrescription,
  getHospitals,
  listPracticeLocations,
  createPracticeLocation,
  updatePracticeLocation,
  deletePracticeLocation,
};
