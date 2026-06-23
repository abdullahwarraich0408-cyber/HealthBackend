const crypto = require('crypto');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const parseTime = (value) => {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const formatTime = (minutes) => {
  const hrs24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const meridiem = hrs24 >= 12 ? 'PM' : 'AM';
  const hrs12 = hrs24 % 12 || 12;
  return `${String(hrs12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${meridiem}`;
};

const normalizeWeeklySchedule = (slots) => {
  if (Array.isArray(slots) && slots.length && slots[0]?.day) {
    return slots;
  }
  if (slots && typeof slots === 'object' && Array.isArray(slots.weekly)) {
    return slots.weekly;
  }
  return DAYS.slice(1, 6).map((day) => ({ day, slots: [] }));
};

const splitTimeRange = (range) =>
  String(range)
    .replace(/[–—]/g, '-')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);

const expandRangeToSlots = (range, intervalMinutes = 30) => {
  const parts = splitTimeRange(range);
  if (parts.length !== 2) return [String(range).trim()].filter(Boolean);

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (start == null || end == null || end <= start) return [String(range).trim()].filter(Boolean);

  const slots = [];
  for (let minute = start; minute < end; minute += intervalMinutes) {
    slots.push(formatTime(minute));
  }
  return slots;
};

const normalizeTimeRange = (range) => {
  const parts = splitTimeRange(range);
  if (parts.length !== 2) return String(range).trim();

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (start == null || end == null || end <= start) return String(range).trim();

  return `${formatTime(start)} - ${formatTime(end)}`;
};

const parseLocalDate = (dateValue) => {
  if (!dateValue) return new Date();
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
    return new Date(`${dateValue.split('T')[0]}T12:00:00`);
  }
  return new Date(dateValue);
};

const getDayName = (dateValue) => {
  const date = parseLocalDate(dateValue);
  return DAYS[date.getDay()];
};

const getScheduleRangesForDate = (weeklySchedule, dateValue) => {
  const dayName = getDayName(dateValue);
  const daySchedule = weeklySchedule.find((entry) => entry.day === dayName);
  if (!daySchedule || !Array.isArray(daySchedule.slots)) return [];
  return daySchedule.slots.map((range) => normalizeTimeRange(range));
};

const normalizeSlotLabel = (value) => {
  const minutes = parseTime(value);
  if (minutes == null) return String(value).trim();
  return formatTime(minutes);
};

const getLocalDayBounds = (dateValue) => {
  let base = parseLocalDate(dateValue);
  if (dateValue instanceof Date) {
    base = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 12, 0, 0);
  } else if (typeof dateValue === 'string' && dateValue.includes('T')) {
    const parsed = new Date(dateValue);
    base = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0);
  }

  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const buildAppointmentDateTime = (dateValue, slotLabel) => {
  const { start } = getLocalDayBounds(dateValue);
  const slotMinutes = parseTime(normalizeSlotLabel(slotLabel));
  if (slotMinutes == null) return start;

  const appointmentDate = new Date(start);
  appointmentDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
  return appointmentDate;
};

const getSlotAvailabilityForDate = (weeklySchedule, dateValue, bookedSlots = []) => {
  const dayName = getDayName(dateValue);
  const daySchedule = weeklySchedule.find((entry) => entry.day === dayName);
  if (!daySchedule || !Array.isArray(daySchedule.slots)) {
    return { slots: [], booked: [] };
  }

  const generated = daySchedule.slots.flatMap((range) => expandRangeToSlots(range));
  const bookedNormalized = new Set(bookedSlots.map((slot) => normalizeSlotLabel(slot)));

  let all = generated;
  const target = parseLocalDate(dateValue);
  const now = new Date();
  if (target.toDateString() === now.toDateString()) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    all = all.filter((slot) => {
      const slotMinutes = parseTime(slot);
      return slotMinutes != null && slotMinutes > nowMinutes;
    });
  }

  const slots = all.filter((slot) => !bookedNormalized.has(normalizeSlotLabel(slot)));
  const booked = all.filter((slot) => bookedNormalized.has(normalizeSlotLabel(slot)));

  return { slots, booked };
};

const getAvailableSlotsForDate = (weeklySchedule, dateValue, bookedSlots = []) =>
  getSlotAvailabilityForDate(weeklySchedule, dateValue, bookedSlots).slots;

const generateMeetingRoom = (appointmentId) => {
  const meetingId = crypto.randomBytes(12).toString('hex');
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return {
    meeting_id: meetingId,
    meeting_url: `${baseUrl.replace(/\/$/, '')}/consultation/${meetingId}?appointment=${appointmentId}`,
  };
};

const assertStatusTransition = (currentStatus, nextStatus) => {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const AppError = require('./AppError');
    throw new AppError(`Cannot transition appointment from ${currentStatus} to ${nextStatus}`, 400);
  }
};

const resolvePaymentStatus = (paymentMethod) => {
  if (!paymentMethod || paymentMethod === 'cod') return 'pending';
  return 'paid';
};

const CHAT_OPEN_HOURS_BEFORE = 24;
const CHAT_CLOSE_HOURS_AFTER_COMPLETION = 72;
const PATIENT_JOIN_MINUTES_BEFORE = 15;
const DOCTOR_JOIN_MINUTES_BEFORE = 30;

const getAppointmentDateTime = (appointment) => {
  const base = getLocalDayBounds(appointment.appointment_date).start;
  const slotMinutes = parseTime(normalizeSlotLabel(appointment.slot));
  if (slotMinutes != null) {
    base.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
  }
  return base;
};

const getChatWindow = (appointment, completedAt = null) => {
  const appointmentAt = getAppointmentDateTime(appointment);
  const opensAt = new Date(appointmentAt);
  opensAt.setHours(opensAt.getHours() - CHAT_OPEN_HOURS_BEFORE);

  let closesAt;
  if (appointment.status === 'completed') {
    const base = completedAt ? new Date(completedAt) : new Date();
    closesAt = new Date(base);
    closesAt.setHours(closesAt.getHours() + CHAT_CLOSE_HOURS_AFTER_COMPLETION);
  } else {
    closesAt = new Date(appointmentAt);
    closesAt.setHours(closesAt.getHours() + CHAT_CLOSE_HOURS_AFTER_COMPLETION + 4);
  }

  return { opensAt, closesAt, appointmentAt };
};

const isOnlineConsultation = (appointment) => {
  if (appointment.consultation_mode === 'in_person') return false;
  if (appointment.consultation_mode === 'online') return true;
  if (appointment.preferred_consultation_mode === 'online') return true;
  return Boolean(appointment.meeting_id);
};

const canAccessChat = (appointment, chatRecord = null) => {
  if (!['confirmed', 'in_progress', 'completed'].includes(appointment.status)) {
    return { allowed: false, reason: 'Chat opens after the doctor confirms your appointment.' };
  }

  if (!isOnlineConsultation(appointment)) {
    return { allowed: false, reason: 'Chat is only available for online checkups.' };
  }

  const window = chatRecord
    ? { opensAt: chatRecord.opens_at, closesAt: chatRecord.closes_at }
    : getChatWindow(appointment);
  const now = new Date();

  if (now < new Date(window.opensAt)) {
    return {
      allowed: false,
      reason: 'Chat opens 24 hours before your appointment.',
      opensAt: window.opensAt,
    };
  }

  if (window.closesAt && now > new Date(window.closesAt)) {
    return {
      allowed: true,
      readOnly: true,
      reason: 'Consultation chat has ended. You can still view past messages below.',
      closesAt: window.closesAt,
    };
  }

  if (chatRecord && chatRecord.is_active === false) {
    return {
      allowed: true,
      readOnly: true,
      reason: 'Consultation chat has ended. You can still view past messages below.',
    };
  }

  return { allowed: true, readOnly: false, opensAt: window.opensAt, closesAt: window.closesAt };
};

const canJoinVideo = (appointment, role) => {
  if (!['confirmed', 'in_progress'].includes(appointment.status)) {
    return { allowed: false, reason: 'Video consultation is available after the doctor confirms.' };
  }

  if (!isOnlineConsultation(appointment)) {
    return { allowed: false, reason: 'Video consultation is only available for online checkups.' };
  }

  if (!appointment.meeting_id) {
    return { allowed: false, reason: 'Video room is not ready yet. Choose online checkup to enable video.' };
  }

  const appointmentAt = getAppointmentDateTime(appointment);
  const now = new Date();
  const minutesBefore = role === 'doctor' ? DOCTOR_JOIN_MINUTES_BEFORE : PATIENT_JOIN_MINUTES_BEFORE;
  const earliestJoin = new Date(appointmentAt);
  earliestJoin.setMinutes(earliestJoin.getMinutes() - minutesBefore);

  if (now < earliestJoin) {
    const waitMins = Math.ceil((earliestJoin.getTime() - now.getTime()) / 60000);
    return {
      allowed: false,
      reason: `You can join ${minutesBefore} minutes before the appointment (${waitMins} min remaining).`,
      earliestJoin,
    };
  }

  return {
    allowed: true,
    waitingRoom: appointment.status === 'confirmed' && role === 'customer',
    roomId: appointment.meeting_id,
    joinUrl: appointment.meeting_url,
  };
};

const buildVideoRoomPayload = (appointmentId, meetingId) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const roomId = meetingId;
  return {
    room_id: roomId,
    join_url: `${baseUrl.replace(/\/$/, '')}/consultation/${roomId}?appointment=${appointmentId}`,
    provider: 'jitsi',
    jitsi_room: `PharmaHub_${roomId}`,
  };
};

module.exports = {
  DAYS,
  VALID_TRANSITIONS,
  isOnlineConsultation,
  normalizeWeeklySchedule,
  normalizeTimeRange,
  normalizeSlotLabel,
  parseLocalDate,
  getLocalDayBounds,
  buildAppointmentDateTime,
  getDayName,
  getScheduleRangesForDate,
  getSlotAvailabilityForDate,
  getAvailableSlotsForDate,
  generateMeetingRoom,
  assertStatusTransition,
  resolvePaymentStatus,
  expandRangeToSlots,
  getAppointmentDateTime,
  getChatWindow,
  canAccessChat,
  canJoinVideo,
  buildVideoRoomPayload,
  CHAT_OPEN_HOURS_BEFORE,
  CHAT_CLOSE_HOURS_AFTER_COMPLETION,
};
