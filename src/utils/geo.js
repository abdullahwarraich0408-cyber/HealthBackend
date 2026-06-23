const CITY_COORDS = {
  lahore: { lat: 31.5497, lng: 74.3436 },
  karachi: { lat: 24.8607, lng: 67.0011 },
  islamabad: { lat: 33.6844, lng: 73.0479 },
  rawalpindi: { lat: 33.5651, lng: 73.0169 },
  faisalabad: { lat: 31.4504, lng: 73.135 },
  gujranwala: { lat: 32.1877, lng: 74.1945 },
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function resolveCoords(source) {
  if (!source) return null;
  if (source.latitude != null && source.longitude != null) {
    return { lat: Number(source.latitude), lng: Number(source.longitude) };
  }
  if (source.lat != null && source.lng != null) {
    return { lat: Number(source.lat), lng: Number(source.lng) };
  }
  const city = String(source.city || '').trim().toLowerCase();
  if (!city) return null;
  return CITY_COORDS[city] || null;
}

function hasKnownLocation(source) {
  if (!source) return false;
  if (source.latitude != null && source.longitude != null) return true;
  if (source.lat != null && source.lng != null) return true;
  return Boolean(String(source.city || '').trim());
}

function etaMinutes(distanceKm, deliveryType = 'standard') {
  if (distanceKm == null) return deliveryType === 'express' ? 30 : 60;
  const base = deliveryType === 'express' ? 20 : 35;
  return Math.round(base + distanceKm * 4);
}

module.exports = {
  haversineKm,
  resolveCoords,
  hasKnownLocation,
  etaMinutes,
  CITY_COORDS,
};
