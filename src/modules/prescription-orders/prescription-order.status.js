/**
 * Prescription order fulfillment statuses (order_status).
 * Do not mix with payment_status.
 */
const ORDER_STATUS = {
  FINDING_VENDOR: 'finding_vendor',
  VENDOR_ASSIGNED: 'vendor_assigned',
  PHARMACY_REVIEWING: 'pharmacy_reviewing',
  AWAITING_CUSTOMER_CONFIRMATION: 'awaiting_customer_confirmation',
  AWAITING_PAYMENT: 'awaiting_payment',
  CONFIRMED: 'confirmed',
  PACKING: 'packing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  NO_VENDOR: 'no_vendor',
};

const PAYMENT_STATUS = {
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
};

const PAYMENT_METHOD = {
  STRIPE: 'stripe',
  COD: 'cod',
};

/** Quotation validity window after pharmacy submits prices */
const QUOTATION_TTL_MS = 30 * 60 * 1000;

/** Map legacy statuses → new ones (in-flight / old rows) */
const LEGACY_STATUS_MAP = {
  awaiting_accept: ORDER_STATUS.VENDOR_ASSIGNED,
  accepted: ORDER_STATUS.PHARMACY_REVIEWING,
  stock_pending: ORDER_STATUS.PHARMACY_REVIEWING,
  stock_confirmed: ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
  customer_review: ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION,
  packed: ORDER_STATUS.PACKING,
  rider_assigned: ORDER_STATUS.READY_FOR_PICKUP,
};

function normalizeOrderStatus(status) {
  if (!status) return ORDER_STATUS.FINDING_VENDOR;
  return LEGACY_STATUS_MAP[status] || status;
}

function serializePrescriptionOrder(order) {
  if (!order) return null;
  const orderStatus = normalizeOrderStatus(order.status);
  return {
    ...order,
    status: orderStatus,
    order_status: orderStatus,
    payment_status: order.payment_status || PAYMENT_STATUS.NOT_REQUIRED,
    payment_method: order.payment_method || null,
    total_amount: Number(order.total_amount ?? order.estimated_value ?? 0),
  };
}

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  QUOTATION_TTL_MS,
  LEGACY_STATUS_MAP,
  normalizeOrderStatus,
  serializePrescriptionOrder,
};
