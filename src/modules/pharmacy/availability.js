const { ACTIVE_VENDOR_STATUSES } = require('../vendors/vendor-availability.service');

const SELLABLE_APPROVAL = new Set(['approved', 'APPROVED']);
const SELLABLE_LISTING = new Set(['ACTIVE', 'active']);

function isVendorSellable(vendor) {
  if (!vendor) return false;
  return ACTIVE_VENDOR_STATUSES.includes(String(vendor.status || '').toLowerCase())
    || ACTIVE_VENDOR_STATUSES.includes(String(vendor.status || ''));
}

function getAvailableStock(product) {
  const inventory = product?.inventory;
  if (inventory && Number.isFinite(Number(inventory.available_quantity))) {
    return Math.max(0, Number(inventory.available_quantity));
  }
  return Math.max(0, Number(product?.stock || 0));
}

function hasSellableBatch(product, now = new Date()) {
  const batches = product?.batches;
  if (!Array.isArray(batches) || batches.length === 0) {
    return getAvailableStock(product) > 0;
  }
  return batches.some((batch) => {
    const qty = Number(batch.quantity_available || 0);
    if (qty <= 0) return false;
    if (!batch.expiry_date) return true;
    return new Date(batch.expiry_date) > now;
  });
}

function isProductCustomerVisible(product, vendor, now = new Date()) {
  if (!product || product.deleted_at) return false;
  if (!isVendorSellable(vendor || product.vendor)) return false;
  if (!SELLABLE_APPROVAL.has(String(product.approval_status || ''))) return false;
  const listing = String(product.listing_status || 'ACTIVE');
  if (!SELLABLE_LISTING.has(listing)) return false;
  if (getAvailableStock(product) <= 0) return false;
  if (!hasSellableBatch(product, now)) return false;
  if (product.controlled_medicine && product.approval_status !== 'approved') return false;
  return true;
}

function deriveStockStatus(product) {
  const available = getAvailableStock(product);
  const threshold = Number(product?.low_stock_threshold ?? 10);
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= threshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function classifyExpiry(expiryDate, now = new Date()) {
  if (!expiryDate) return 'Healthy';
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 7) return 'Expires within 7 days';
  if (diffDays <= 30) return 'Expires within 30 days';
  if (diffDays <= 60) return 'Expires within 60 days';
  if (diffDays <= 90) return 'Expires within 90 days';
  return 'Healthy';
}

function pickFefoBatch(batches = [], quantity, now = new Date()) {
  const usable = (batches || [])
    .filter((batch) => Number(batch.quantity_available || 0) > 0)
    .filter((batch) => !batch.expiry_date || new Date(batch.expiry_date) > now)
    .sort((a, b) => {
      const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aExp - bExp;
    });

  const allocations = [];
  let remaining = Number(quantity || 0);
  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.quantity_available));
    allocations.push({ batch, quantity: take });
    remaining -= take;
  }
  return { allocations, remaining };
}

module.exports = {
  isVendorSellable,
  getAvailableStock,
  hasSellableBatch,
  isProductCustomerVisible,
  deriveStockStatus,
  classifyExpiry,
  pickFefoBatch,
};
