const { normalizeCategoryName, DOSAGE_FORMS } = require('./catalog.constants');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function emptyToNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value, fallback) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value === undefined) return undefined;
  if (value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return fallback;
}

function sanitizeProductPayload(data = {}, { forCreate = false } = {}) {
  const name = data.name !== undefined ? String(data.name).trim() : undefined;
  const price = toNumber(data.price ?? data.retail_price);
  const salePrice = toNumber(data.sale_price);
  const payload = {
    ...(name !== undefined ? { name } : {}),
    ...(name !== undefined ? { slug: slugify(name) } : {}),
    ...(data.formula !== undefined ? { formula: emptyToNull(data.formula) } : {}),
    ...(data.generic_name !== undefined || data.formula !== undefined
      ? { generic_name: emptyToNull(data.generic_name || data.formula) }
      : {}),
    ...(data.brand_name !== undefined || data.brand !== undefined
      ? { brand_name: emptyToNull(data.brand_name || data.brand) }
      : {}),
    ...(data.manufacturer !== undefined ? { manufacturer: emptyToNull(data.manufacturer) } : {}),
    ...(data.description !== undefined ? { description: emptyToNull(data.description) } : {}),
    ...(data.usage_instructions !== undefined ? { usage_instructions: emptyToNull(data.usage_instructions) } : {}),
    ...(data.warnings !== undefined ? { warnings: emptyToNull(data.warnings) } : {}),
    ...(data.side_effects !== undefined ? { side_effects: emptyToNull(data.side_effects) } : {}),
    ...(data.contraindications !== undefined ? { contraindications: emptyToNull(data.contraindications) } : {}),
    ...(price !== undefined ? { price, retail_price: price } : {}),
    ...(data.sale_price !== undefined ? { sale_price: salePrice } : {}),
    ...(data.cost_price !== undefined ? { cost_price: toNumber(data.cost_price, null) } : {}),
    ...(data.stock !== undefined ? { stock: Math.max(0, Math.trunc(toNumber(data.stock, 0))) } : {}),
    ...(data.image_url !== undefined ? { image_url: emptyToNull(data.image_url) } : {}),
    ...(data.category !== undefined ? { category: normalizeCategoryName(data.category) } : {}),
    ...(data.subcategory !== undefined ? { subcategory: emptyToNull(data.subcategory) } : {}),
    ...(data.dosage_form !== undefined ? { dosage_form: emptyToNull(data.dosage_form) } : {}),
    ...(data.strength !== undefined ? { strength: emptyToNull(data.strength) } : {}),
    ...(data.pack_size !== undefined ? { pack_size: emptyToNull(data.pack_size) } : {}),
    ...(data.sku !== undefined ? { sku: emptyToNull(data.sku) } : {}),
    ...(data.barcode !== undefined ? { barcode: emptyToNull(data.barcode) } : {}),
    ...(data.prescription_required !== undefined
      ? { prescription_required: toBool(data.prescription_required, false) }
      : {}),
    ...(data.controlled_medicine !== undefined
      ? { controlled_medicine: toBool(data.controlled_medicine, false) }
      : {}),
    ...(data.listing_status !== undefined ? { listing_status: String(data.listing_status).toUpperCase() } : {}),
    ...(data.low_stock_threshold !== undefined
      ? { low_stock_threshold: Math.max(0, Math.trunc(toNumber(data.low_stock_threshold, 10))) }
      : {}),
  };

  if (forCreate) {
    payload.formula = payload.formula ?? payload.generic_name ?? null;
    payload.generic_name = payload.generic_name ?? payload.formula ?? null;
    payload.retail_price = payload.retail_price ?? payload.price;
    payload.listing_status = payload.listing_status || 'ACTIVE';
    payload.low_stock_threshold = payload.low_stock_threshold ?? 10;
    payload.prescription_required = payload.prescription_required ?? false;
    payload.controlled_medicine = payload.controlled_medicine ?? false;
    payload.stock = payload.stock ?? 0;
  }

  if (
    payload.sale_price != null &&
    payload.price != null &&
    Number(payload.sale_price) > Number(payload.price)
  ) {
    const error = new Error('Sale price cannot exceed retail price');
    error.statusCode = 400;
    throw error;
  }

  if (payload.dosage_form && !DOSAGE_FORMS.includes(payload.dosage_form) && payload.dosage_form !== 'Other') {
    payload.dosage_form = 'Other';
  }

  return payload;
}

function publicProductFilter() {
  return {
    deleted_at: null,
    approval_status: 'approved',
    listing_status: { in: ['ACTIVE', 'active'] },
    stock: { gt: 0 },
  };
}

module.exports = {
  slugify,
  sanitizeProductPayload,
  publicProductFilter,
  emptyToNull,
  toNumber,
  toBool,
};
