const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const {
  normalizeWeeklySchedule,
  normalizeSlotLabel,
  parseLocalDate,
  getLocalDayBounds,
  buildAppointmentDateTime,
  getDayName,
  getScheduleRangesForDate,
  getSlotAvailabilityForDate,
  canJoinVideo,
  resolvePaymentStatus,
  assertStatusTransition,
} = require('../../utils/telehealth.utils');
const { notifyAppointmentBooked } = require('../../utils/telehealth.notifications');
const {
  mapPracticeLocation,
  practiceLocationInclude,
  resolvePracticeLocation,
  getSlotsForLocationOnDate,
} = require('../../utils/practice-locations.utils');

const FILTER_OPTIONS = {
  specialties: [
    'General Physician',
    'Cardiologist',
    'Dermatologist',
    'Pediatrician',
    'Gynecologist',
    'Psychiatrist',
    'Orthopedic',
  ],
  languages: ['English', 'Urdu', 'Punjabi', 'Sindhi'],
  experience: ['5+ years', '10+ years', '15+ years', '20+ years'],
};

const appointmentInclude = {
  doctor: {
    select: {
      id: true,
      name: true,
      specialty: true,
      photo_url: true,
      hospital: true,
      hospital_id: true,
      fee: true,
      hospital_ref: { select: { id: true, name: true, slug: true, city: true } },
      account: { select: { email: true } },
    },
  },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  prescription: true,
  review: true,
};

const getFilters = async () => FILTER_OPTIONS;

const doctorInclude = {
  hospital_ref: {
    select: { id: true, name: true, slug: true, city: true, logo: true, address: true },
  },
  practice_locations: {
    where: { is_active: true },
    include: practiceLocationInclude,
    orderBy: { created_at: 'asc' },
  },
};

const getDoctors = async (query = {}) => {
  const where = { is_active: true };

  if (query.specialty) where.specialty = query.specialty;
  if (query.online === 'true') where.online = true;
  if (query.availableToday === 'true') where.available_today = true;
  if (query.hospital_id) where.hospital_id = query.hospital_id;

  let doctors = await prisma.doctor.findMany({
    where,
    include: doctorInclude,
    orderBy: { rating: 'desc' },
  });

  if (query.q) {
    const q = query.q.toLowerCase();
    doctors = doctors.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.hospital.toLowerCase().includes(q) ||
        (d.hospital_ref?.name || '').toLowerCase().includes(q)
    );
  }

  if (query.language) {
    const langs = query.language.split(',');
    doctors = doctors.filter((d) => {
      const doctorLangs = Array.isArray(d.languages) ? d.languages : [];
      return langs.some((lang) => doctorLangs.includes(lang));
    });
  }

  if (query.experience) {
    const minYears = parseInt(query.experience, 10);
    if (!Number.isNaN(minYears)) {
      doctors = doctors.filter((d) => d.experience_years >= minYears);
    }
  }

  if (query.minFee || query.maxFee) {
    const minFee = query.minFee ? parseFloat(query.minFee) : null;
    const maxFee = query.maxFee ? parseFloat(query.maxFee) : null;
    doctors = doctors.filter((d) => {
      if (minFee != null && d.fee < minFee) return false;
      if (maxFee != null && d.fee > maxFee) return false;
      return true;
    });
  }

  return doctors;
};

const getDoctorById = async (id) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: doctorInclude,
  });
  if (!doctor || !doctor.is_active) {
    throw new AppError('Doctor not found', 404);
  }
  return doctor;
};

const getDoctorReviews = async (doctorId) => {
  await getDoctorById(doctorId);
  return prisma.doctorReview.findMany({
    where: { doctor_id: doctorId },
    orderBy: { created_at: 'desc' },
  });
};

const getBookedSlotsForDate = async (doctorId, dateValue, tx = prisma) => {
  const { start, end } = getLocalDayBounds(dateValue);

  const appointments = await tx.doctorAppointment.findMany({
    where: {
      doctor_id: doctorId,
      appointment_date: { gte: start, lt: end },
      status: { notIn: ['cancelled'] },
    },
    select: { slot: true },
  });

  return appointments.map((item) => normalizeSlotLabel(item.slot));
};

const getDoctorPracticeLocations = async (doctorId) => {
  const doctor = await getDoctorById(doctorId);
  return (doctor.practice_locations || []).map(mapPracticeLocation);
};

const getDoctorSlots = async (doctorId, dateValue, query = {}) => {
  const doctor = await getDoctorById(doctorId);
  const targetDate = parseLocalDate(dateValue);
  const bookedSlots = await getBookedSlotsForDate(doctorId, targetDate);

  const isInPerson =
    query.consult === 'in_person' ||
    query.hospital_id ||
    query.practice_location_id;

  if (isInPerson) {
    const location = await resolvePracticeLocation(prisma, doctorId, query);
    if (!location) {
      throw new AppError('Practice location not found for this doctor', 404);
    }

    const availability = getSlotsForLocationOnDate(location, targetDate, bookedSlots);
    return {
      ...availability,
      practice_location_id: location.id,
      hospital_id: location.hospital_id,
      location_title: location.hospital?.name || location.clinic_name,
      fee: location.fee ?? doctor.fee,
    };
  }

  const weeklySchedule = normalizeWeeklySchedule(doctor.slots);
  const ranges = getScheduleRangesForDate(weeklySchedule, targetDate);
  const { slots, booked } = getSlotAvailabilityForDate(weeklySchedule, targetDate, bookedSlots);

  return {
    slots,
    booked,
    ranges,
    day: getDayName(targetDate),
    works_this_day: ranges.length > 0,
    fee: doctor.fee,
  };
};

const bookAppointment = async (customerId, data) => {
  const doctor = await getDoctorById(data.doctor_id);
  const normalizedSlot = normalizeSlotLabel(data.slot);
  const appointmentDateInput = data.appointment_date || new Date();
  const isInPerson = data.preferred_consultation_mode === 'in_person';

  return prisma.$transaction(async (tx) => {
    const bookedSlots = await getBookedSlotsForDate(doctor.id, appointmentDateInput, tx);
    let fee = doctor.fee;
    let hospitalId = null;
    let practiceLocationId = null;

    if (isInPerson) {
      const location = await resolvePracticeLocation(prisma, doctor.id, {
        hospital_id: data.hospital_id,
        practice_location_id: data.practice_location_id,
      });
      if (!location) {
        throw new AppError('Please select a valid hospital/clinic for this appointment', 400);
      }

      const availability = getSlotsForLocationOnDate(location, appointmentDateInput, bookedSlots);
      if (!availability.works_this_day) {
        throw new AppError('Doctor is not available at this hospital on the selected day', 400);
      }

      const isAvailable = availability.slots.some(
        (slot) => normalizeSlotLabel(slot) === normalizedSlot
      );
      if (!isAvailable) {
        throw new AppError('Selected slot is not available at this location', 400);
      }

      fee = location.fee ?? doctor.fee;
      hospitalId = location.hospital_id;
      practiceLocationId = location.id;
    } else {
      const weeklySchedule = normalizeWeeklySchedule(doctor.slots);
      const { slots } = getSlotAvailabilityForDate(weeklySchedule, appointmentDateInput, bookedSlots);
      const isAvailable = slots.some((slot) => normalizeSlotLabel(slot) === normalizedSlot);
      if (!isAvailable) {
        throw new AppError('Selected slot is not available', 400);
      }
    }

    const appointmentDate = buildAppointmentDateTime(appointmentDateInput, normalizedSlot);

    const appointment = await tx.doctorAppointment.create({
      data: {
        doctor_id: doctor.id,
        customer_id: customerId,
        slot: normalizedSlot,
        appointment_date: appointmentDate,
        fee,
        hospital_id: hospitalId,
        payment_method: data.payment_method,
        payment_status: resolvePaymentStatus(data.payment_method),
        reason: data.reason || null,
        preferred_consultation_mode: data.preferred_consultation_mode || null,
        status: 'pending',
      },
      include: appointmentInclude,
    });

    const patientEmail = appointment.customer?.email;
    const doctorEmail = doctor.email || appointment.doctor?.account?.email;
    if (patientEmail || doctorEmail) {
      await notifyAppointmentBooked({
        doctorEmail,
        patientEmail,
        appointment,
      });
    }

    return appointment;
  });
};

const getCustomerAppointments = async (customerId) => {
  return prisma.doctorAppointment.findMany({
    where: { customer_id: customerId },
    include: appointmentInclude,
    orderBy: { appointment_date: 'desc' },
  });
};

const getCustomerAppointmentById = async (customerId, appointmentId) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, customer_id: customerId },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError('Appointment not found', 404);
  return appointment;
};

const cancelAppointment = async (customerId, appointmentId) => {
  const appointment = await getCustomerAppointmentById(customerId, appointmentId);
  assertStatusTransition(appointment.status, 'cancelled');

  return prisma.doctorAppointment.update({
    where: { id: appointmentId },
    data: { status: 'cancelled' },
    include: appointmentInclude,
  });
};

const updateAppointment = async (customerId, appointmentId, data) => {
  const appointment = await getCustomerAppointmentById(customerId, appointmentId);
  if (!['pending', 'confirmed'].includes(appointment.status)) {
    throw new AppError('Only pending or confirmed appointments can be rescheduled', 400);
  }

  const appointmentDate = data.appointment_date ? new Date(data.appointment_date) : appointment.appointment_date;
  const slot = normalizeSlotLabel(data.slot || appointment.slot);
  const availableSlots = (await getDoctorSlots(appointment.doctor_id, appointmentDate)).slots;
  const sameSlot =
    normalizeSlotLabel(slot) === normalizeSlotLabel(appointment.slot) &&
    appointmentDate.toDateString() === new Date(appointment.appointment_date).toDateString();

  if (!sameSlot && !availableSlots.some((item) => normalizeSlotLabel(item) === slot)) {
    throw new AppError('Selected slot is not available', 400);
  }

  return prisma.doctorAppointment.update({
    where: { id: appointmentId },
    data: {
      slot,
      appointment_date: buildAppointmentDateTime(appointmentDate, slot),
      reason: data.reason ?? appointment.reason,
    },
    include: appointmentInclude,
  });
};

const joinConsultation = async (customerId, appointmentId) => {
  const appointment = await getCustomerAppointmentById(customerId, appointmentId);

  const videoAccess = canJoinVideo(appointment, 'customer');
  if (!videoAccess.allowed) {
    throw new AppError(videoAccess.reason || 'Consultation is not ready to join yet', 400);
  }

  if (appointment.status === 'confirmed') {
    assertStatusTransition(appointment.status, 'in_progress');
    return prisma.doctorAppointment.update({
      where: { id: appointmentId },
      data: { status: 'in_progress' },
      include: appointmentInclude,
    });
  }

  return appointment;
};

const getConsultationByMeetingId = async (meetingId, user) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { meeting_id: meetingId },
    include: appointmentInclude,
  });

  if (!appointment) throw new AppError('Consultation not found', 404);

  const isDoctor = user.role === 'doctor' && user.id === appointment.doctor_id;
  const isCustomer = user.role === 'customer' && user.id === appointment.customer_id;
  if (!isDoctor && !isCustomer) {
    throw new AppError('You do not have access to this consultation', 403);
  }

  if (!['confirmed', 'in_progress', 'completed'].includes(appointment.status)) {
    throw new AppError('Consultation is not available', 400);
  }

  return appointment;
};

const selectConsultationMode = async (customerId, appointmentId, mode) => {
  const appointment = await getCustomerAppointmentById(customerId, appointmentId);

  if (appointment.status !== 'confirmed') {
    throw new AppError('Consultation type can only be chosen after the doctor confirms your appointment', 400);
  }

  return activateConsultationMode(appointmentId, mode);
};

const submitDoctorReview = async (customerId, doctorId, data) => {
  await getDoctorById(doctorId);

  const appointment = await prisma.doctorAppointment.findFirst({
    where: {
      id: data.appointment_id,
      doctor_id: doctorId,
      customer_id: customerId,
      status: 'completed',
    },
    include: { review: true, customer: true },
  });

  if (!appointment) {
    throw new AppError('Completed appointment required before leaving a review', 400);
  }
  if (appointment.review) {
    throw new AppError('Review already submitted for this appointment', 400);
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.doctorReview.create({
      data: {
        doctor_id: doctorId,
        customer_id: customerId,
        appointment_id: appointment.id,
        author_name: appointment.customer?.name || data.author_name || 'Patient',
        rating: data.rating,
        comment: data.comment || null,
      },
    });

    const aggregate = await tx.doctorReview.aggregate({
      where: { doctor_id: doctorId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await tx.doctor.update({
      where: { id: doctorId },
      data: {
        rating: aggregate._avg.rating || 0,
        reviews_count: aggregate._count.rating || 0,
      },
    });

    return created;
  });

  return review;
};

const updateDoctorSlots = async (doctorUserId, doctorId, slots) => {
  if (doctorUserId !== doctorId) {
    throw new AppError('You can only update your own schedule', 403);
  }

  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: { slots: normalizeWeeklySchedule(slots) },
  });

  return doctor;
};

module.exports = {
  getFilters,
  getDoctors,
  getDoctorById,
  getDoctorReviews,
  getDoctorPracticeLocations,
  getDoctorSlots,
  bookAppointment,
  getCustomerAppointments,
  getCustomerAppointmentById,
  cancelAppointment,
  updateAppointment,
  joinConsultation,
  selectConsultationMode,
  getConsultationByMeetingId,
  submitDoctorReview,
  updateDoctorSlots,
};
