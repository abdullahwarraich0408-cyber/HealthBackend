const {
  normalizeWeeklySchedule,
  getDayName,
  getSlotAvailabilityForDate,
  parseLocalDate,
} = require('./telehealth.utils');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const practiceLocationInclude = {
  hospital: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      address: true,
      logo: true,
    },
  },
};

const normalizeLocationSchedule = (schedule) => normalizeWeeklySchedule(schedule);

const getLocationTitle = (location) =>
  location.hospital?.name || location.clinic_name || 'Clinic';

const getLocationAddress = (location) => {
  if (location.address) return location.address;
  if (location.hospital?.address) {
    return location.hospital.city
      ? `${location.hospital.address}, ${location.hospital.city}`
      : location.hospital.address;
  }
  return location.hospital?.city || null;
};

const locationWorksOnDay = (location, dayName) => {
  const schedule = normalizeLocationSchedule(location.schedule);
  const dayEntry = schedule.find((entry) => entry.day === dayName);
  return Boolean(dayEntry?.slots?.length);
};

const getNextAvailableDateForLocation = (location, fromDate = new Date(), maxDays = 21) => {
  const schedule = normalizeLocationSchedule(location.schedule);
  const start = new Date(fromDate);
  start.setHours(12, 0, 0, 0);

  for (let offset = 0; offset < maxDays; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    const dayName = DAYS[candidate.getDay()];
    const dayEntry = schedule.find((entry) => entry.day === dayName);
    if (dayEntry?.slots?.length) {
      return candidate;
    }
  }
  return null;
};

const formatAvailabilityLabel = (date) => {
  if (!date) return 'No upcoming slots';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Available today';
  if (diffDays === 1) return 'Available tomorrow';
  return `Available ${target.toLocaleDateString('en-PK', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`;
};

const mapPracticeLocation = (location) => {
  const nextDate = getNextAvailableDateForLocation(location);
  const schedule = normalizeLocationSchedule(location.schedule);
  const days = schedule.filter((entry) => entry.slots?.length).map((entry) => entry.day);

  return {
    id: location.id,
    doctor_id: location.doctor_id,
    hospital_id: location.hospital_id,
    clinic_name: location.clinic_name,
    address: getLocationAddress(location),
    title: getLocationTitle(location),
    fee: location.fee,
    days,
    schedule,
    next_available_date: nextDate ? nextDate.toISOString().slice(0, 10) : null,
    availability: formatAvailabilityLabel(nextDate),
    hospital: location.hospital || null,
  };
};

const resolvePracticeLocation = async (prisma, doctorId, { hospital_id, practice_location_id }) => {
  if (practice_location_id) {
    const location = await prisma.doctorPracticeLocation.findFirst({
      where: { id: practice_location_id, doctor_id: doctorId, is_active: true },
      include: practiceLocationInclude,
    });
    return location;
  }

  if (hospital_id) {
    const location = await prisma.doctorPracticeLocation.findFirst({
      where: { doctor_id: doctorId, hospital_id, is_active: true },
      include: practiceLocationInclude,
    });
    return location;
  }

  return null;
};

const getSlotsForLocationOnDate = (location, dateValue, bookedSlots = []) => {
  const schedule = normalizeLocationSchedule(location.schedule);
  const targetDate = parseLocalDate(dateValue);
  const dayName = getDayName(targetDate);

  if (!locationWorksOnDay(location, dayName)) {
    return {
      slots: [],
      booked: [],
      ranges: [],
      day: dayName,
      works_this_day: false,
    };
  }

  const ranges = schedule
    .find((entry) => entry.day === dayName)
    ?.slots?.map((range) => String(range).trim()) || [];
  const { slots, booked } = getSlotAvailabilityForDate(schedule, targetDate, bookedSlots);

  return {
    slots,
    booked,
    ranges,
    day: dayName,
    works_this_day: true,
  };
};

module.exports = {
  practiceLocationInclude,
  normalizeLocationSchedule,
  getLocationTitle,
  getLocationAddress,
  locationWorksOnDay,
  getNextAvailableDateForLocation,
  formatAvailabilityLabel,
  mapPracticeLocation,
  resolvePracticeLocation,
  getSlotsForLocationOnDate,
};
