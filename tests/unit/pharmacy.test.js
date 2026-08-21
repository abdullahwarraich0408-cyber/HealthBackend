const {
  toCanonicalStatus,
  canTransition,
  generateOrderNumber,
  allowedActions,
} = require('../../src/modules/pharmacy/order-transitions');
const { calculateOrderFinancials, toMoney } = require('../../src/modules/pharmacy/money');
const { isProductCustomerVisible, deriveStockStatus, classifyExpiry, pickFefoBatch } = require('../../src/modules/pharmacy/availability');
const { hasPermission, canReviewPrescriptions } = require('../../src/modules/pharmacy/permissions');
const { sanitizeProductPayload } = require('../../src/modules/pharmacy/product-payload');
const { isKnownCategory, normalizeCategoryName } = require('../../src/modules/pharmacy/catalog.constants');
const { parseCSV, mapImportRow, validateImportRow } = require('../../src/modules/inventory/inventory.service');

describe('order transitions', () => {
  it('maps legacy pending to NEW', () => {
    expect(toCanonicalStatus('pending')).toBe('NEW');
    expect(toCanonicalStatus('shipped')).toBe('OUT_FOR_DELIVERY');
  });

  it('allows NEW -> ACCEPTED and NEW -> REJECTED only', () => {
    expect(canTransition('NEW', 'ACCEPTED')).toBe(true);
    expect(canTransition('pending', 'REJECTED')).toBe(true);
    expect(canTransition('NEW', 'DELIVERED')).toBe(false);
  });

  it('generates friendly order numbers', () => {
    expect(generateOrderNumber(421, 2026)).toBe('MZ-ORD-2026-000421');
  });

  it('returns workflow actions for NEW orders', () => {
    expect(allowedActions('pending')).toContain('Accept Order');
  });
});

describe('financial calculation', () => {
  it('calculates net earnings server-side', () => {
    const result = calculateOrderFinancials({
      subtotal: 1000,
      commissionRate: 10,
      platformFeeRate: 2,
      refundAmount: 50,
    });
    expect(result.gross).toBe(1000);
    expect(result.commission).toBe(100);
    expect(result.platformFee).toBe(20);
    expect(result.vendorNet).toBe(830);
  });

  it('never returns negative money from invalid input', () => {
    expect(toMoney('abc')).toBe(0);
  });
});

describe('product availability', () => {
  const vendor = { status: 'approved' };
  const base = {
    deleted_at: null,
    approval_status: 'approved',
    listing_status: 'ACTIVE',
    stock: 5,
    inventory: { available_quantity: 5 },
    batches: [],
  };

  it('hides products that are not approved or out of stock', () => {
    expect(isProductCustomerVisible(base, vendor)).toBe(true);
    expect(isProductCustomerVisible({ ...base, approval_status: 'pending_review' }, vendor)).toBe(false);
    expect(isProductCustomerVisible({ ...base, stock: 0, inventory: { available_quantity: 0 } }, vendor)).toBe(false);
    expect(isProductCustomerVisible(base, { status: 'pending' })).toBe(false);
  });

  it('calculates low stock from threshold', () => {
    expect(deriveStockStatus({ stock: 2, low_stock_threshold: 10, inventory: { available_quantity: 2 } })).toBe('LOW_STOCK');
    expect(deriveStockStatus({ stock: 0, inventory: { available_quantity: 0 } })).toBe('OUT_OF_STOCK');
  });

  it('classifies expiry windows', () => {
    const now = new Date('2026-08-20');
    expect(classifyExpiry('2026-07-01', now)).toBe('Expired');
    expect(classifyExpiry('2026-09-10', now)).toBe('Expires within 30 days');
    expect(classifyExpiry('2027-01-01', now)).toBe('Healthy');
  });

  it('allocates FEFO from earliest expiry', () => {
    const { allocations, remaining } = pickFefoBatch(
      [
        { id: 'b2', quantity_available: 4, expiry_date: '2026-12-01' },
        { id: 'b1', quantity_available: 3, expiry_date: '2026-09-01' },
      ],
      5,
      new Date('2026-08-20')
    );
    expect(allocations[0].batch.id).toBe('b1');
    expect(allocations[0].quantity).toBe(3);
    expect(allocations[1].quantity).toBe(2);
    expect(remaining).toBe(0);
  });
});

describe('permissions', () => {
  it('lets owners do everything and blocks viewers from writes', () => {
    expect(hasPermission({ staffRole: 'OWNER' }, 'staff.write')).toBe(true);
    expect(hasPermission({ staffRole: 'VIEWER' }, 'orders.write')).toBe(false);
    expect(canReviewPrescriptions({ staffRole: 'PHARMACIST' })).toBe(true);
    expect(canReviewPrescriptions({ staffRole: 'ORDER_STAFF' })).toBe(false);
  });
});

describe('product payload and bulk import validation', () => {
  it('rejects sale price above retail', () => {
    expect(() => sanitizeProductPayload({ name: 'Panadol', price: 100, sale_price: 120 })).toThrow(/Sale price/);
  });

  it('normalizes known categories', () => {
    expect(normalizeCategoryName('pain relief')).toBe('Pain Relief');
    expect(isKnownCategory('Antibiotics')).toBe(true);
    expect(isKnownCategory('Snacks')).toBe(false);
  });

  it('parses csv and flags invalid rows without importing them', async () => {
    const csv = [
      'product_name,category,retail_price,stock,sku',
      'Panadol Extra,Pain Relief,150,20,PAN-1',
      ',Pain Relief,abc,-4,PAN-1',
    ].join('\n');
    const rows = parseCSV(csv).map(mapImportRow);
    expect(rows).toHaveLength(2);
    expect(validateImportRow(rows[0]).length).toBe(0);
    expect(validateImportRow(rows[1]).join(' ')).toMatch(/Missing product name/);
    expect(validateImportRow(rows[1]).join(' ')).toMatch(/Invalid price/);
  });
});
