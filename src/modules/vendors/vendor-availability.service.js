const ACTIVE_VENDOR_STATUSES = ['approved', 'active'];

function normalizeClock(value) {
  if (!value) return null;
  const [rawHours, rawMinutes = '00'] = String(value).split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function minutesForClock(value) {
  const parsed = normalizeClock(value);
  if (!parsed) return null;
  return parsed.hours * 60 + parsed.minutes;
}

function isVendorOnHoliday(vendor, now = new Date()) {
  if (!vendor?.holiday_mode_enabled) return false;
  const startsAt = vendor.holiday_starts_at ? new Date(vendor.holiday_starts_at) : null;
  const endsAt = vendor.holiday_ends_at ? new Date(vendor.holiday_ends_at) : null;

  if (!startsAt && !endsAt) return true;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

function isWithinOperatingHours(hours = [], now = new Date()) {
  if (!hours.length) return null;
  const day = now.getDay();
  const today = hours.find((entry) => Number(entry.day_of_week) === day);

  if (!today) return false;
  if (today.is_closed) return false;

  const openMinutes = minutesForClock(today.open_time);
  const closeMinutes = minutesForClock(today.close_time);
  if (openMinutes == null || closeMinutes == null) return true;

  const currentMinutes = minutesSinceMidnight(now);
  if (closeMinutes >= openMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }

  // Overnight schedule, e.g. 20:00 -> 02:00.
  return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
}

function serviceAreaMatches(address = {}, serviceAreas = []) {
  if (!serviceAreas.length) return true;

  const city = String(address?.city || '').toLowerCase();
  const street = String(address?.street || '').toLowerCase();
  const area = String(address?.area || '').toLowerCase();
  const zip = String(address?.zip || address?.postal_code || '').toLowerCase();

  return serviceAreas.some((serviceArea) => {
    if (serviceArea.is_active === false) return false;
    const name = String(serviceArea.name || '').toLowerCase();
    const areaCity = String(serviceArea.city || '').toLowerCase();
    const postalCodes = Array.isArray(serviceArea.postal_codes)
      ? serviceArea.postal_codes.map((code) => String(code).toLowerCase())
      : [];

    const cityMatches = !areaCity || city.includes(areaCity) || areaCity.includes(city);
    const labelMatches = !name || street.includes(name) || area.includes(name) || city.includes(name);
    const postalMatches = !postalCodes.length || postalCodes.includes(zip);

    return cityMatches && labelMatches && postalMatches;
  });
}

function computeVendorAvailability(vendor, now = new Date()) {
  const statusAllowed = ACTIVE_VENDOR_STATUSES.includes(vendor?.status);
  const onlineAllowed =
    vendor?.manual_online_override == null
      ? Boolean(vendor?.is_online)
      : Boolean(vendor?.manual_online_override);
  const holidayBlocked = isVendorOnHoliday(vendor, now);
  const hoursState = isWithinOperatingHours(vendor?.operating_hours || [], now);
  const openAllowed = hoursState == null ? Boolean(vendor?.is_open) : Boolean(hoursState);

  return {
    statusAllowed,
    onlineAllowed,
    holidayBlocked,
    openAllowed,
    isAvailable: statusAllowed && onlineAllowed && !holidayBlocked && openAllowed,
  };
}

module.exports = {
  ACTIVE_VENDOR_STATUSES,
  computeVendorAvailability,
  isVendorOnHoliday,
  isWithinOperatingHours,
  serviceAreaMatches,
};
