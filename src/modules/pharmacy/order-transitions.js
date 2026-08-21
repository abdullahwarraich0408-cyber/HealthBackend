const CANONICAL_STATUSES = [
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
];

const LEGACY_TO_CANONICAL = {
  pending: 'NEW',
  awaiting_payment: 'NEW',
  processing: 'ACCEPTED',
  shipped: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  rejected: 'REJECTED',
};

const CANONICAL_TO_LEGACY = {
  NEW: 'pending',
  ACCEPTED: 'processing',
  PREPARING: 'processing',
  READY_FOR_PICKUP: 'processing',
  OUT_FOR_DELIVERY: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'cancelled',
  RETURN_REQUESTED: 'delivered',
  RETURNED: 'delivered',
  REFUNDED: 'cancelled',
};

const TRANSITIONS = {
  NEW: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'REJECTED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  REJECTED: [],
  REFUNDED: [],
};

function toCanonicalStatus(status) {
  if (!status) return 'NEW';
  const raw = String(status);
  if (CANONICAL_STATUSES.includes(raw)) return raw;
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (CANONICAL_STATUSES.includes(upper)) return upper;
  return LEGACY_TO_CANONICAL[raw.toLowerCase()] || raw.toUpperCase();
}

function toLegacyStatus(status) {
  const canonical = toCanonicalStatus(status);
  return CANONICAL_TO_LEGACY[canonical] || canonical.toLowerCase();
}

function canTransition(from, to) {
  const current = toCanonicalStatus(from);
  const next = toCanonicalStatus(to);
  if (current === next) return true;
  return (TRANSITIONS[current] || []).includes(next);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const current = toCanonicalStatus(from);
    const next = toCanonicalStatus(to);
    const error = new Error(`Invalid order status transition from ${current} to ${next}`);
    error.statusCode = 400;
    throw error;
  }
}

function timestampFieldForStatus(status) {
  switch (toCanonicalStatus(status)) {
    case 'ACCEPTED':
      return 'accepted_at';
    case 'PREPARING':
      return 'preparing_at';
    case 'READY_FOR_PICKUP':
      return 'ready_at';
    case 'OUT_FOR_DELIVERY':
      return 'out_for_delivery_at';
    case 'DELIVERED':
      return 'delivered_at';
    case 'COMPLETED':
      return 'completed_at';
    case 'CANCELLED':
    case 'REJECTED':
      return 'cancelled_at';
    default:
      return null;
  }
}

function allowedActions(status) {
  const current = toCanonicalStatus(status);
  switch (current) {
    case 'NEW':
      return ['Accept Order', 'Reject Order', 'View Details'];
    case 'ACCEPTED':
      return ['Start Preparing', 'Cancel Order', 'View Details'];
    case 'PREPARING':
      return ['Mark Ready', 'View Details'];
    case 'READY_FOR_PICKUP':
      return ['Hand to Rider', 'View Details'];
    case 'OUT_FOR_DELIVERY':
      return ['View Details'];
    case 'DELIVERED':
    case 'COMPLETED':
      return ['View Details'];
    default:
      return ['View Details'];
  }
}

function generateOrderNumber(sequence, year = new Date().getFullYear()) {
  const padded = String(sequence).padStart(6, '0');
  return `MZ-ORD-${year}-${padded}`;
}

module.exports = {
  CANONICAL_STATUSES,
  LEGACY_TO_CANONICAL,
  TRANSITIONS,
  toCanonicalStatus,
  toLegacyStatus,
  canTransition,
  assertTransition,
  timestampFieldForStatus,
  allowedActions,
  generateOrderNumber,
};
