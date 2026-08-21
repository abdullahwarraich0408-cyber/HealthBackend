const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const { classifyExpiry, deriveStockStatus, pickFefoBatch } = require('../pharmacy/availability');
const { isKnownCategory, normalizeCategoryName } = require('../pharmacy/catalog.constants');
const { sanitizeProductPayload } = require('../pharmacy/product-payload');

function parseCSV(csvText) {
  const lines = String(csvText || '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const items = [];

  for (let i = 1; i < lines.length; i += 1) {
    const currentLine = lines[i];
    const cells = [];
    let insideQuote = false;
    let currentCell = '';

    for (let charIndex = 0; charIndex < currentLine.length; charIndex += 1) {
      const char = currentLine[charIndex];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

    if (cells.length >= headers.length) {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = cells[index];
      });
      items.push({ ...item, _row: i + 1 });
    }
  }
  return items;
}

function mapImportRow(item) {
  return {
    row: item._row,
    name: item.product_name || item.name || item.Name || '',
    generic_name: item.generic_name || item.formula || item.Formula || '',
    brand_name: item.brand || item.brand_name || '',
    manufacturer: item.manufacturer || '',
    category: item.category || item.Category || '',
    subcategory: item.subcategory || '',
    dosage_form: item.dosage_form || '',
    strength: item.strength || '',
    pack_size: item.pack_size || '',
    price: item.retail_price || item.price || item.Price || '',
    sale_price: item.sale_price || '',
    stock: item.stock || item.Stock || '0',
    low_stock_threshold: item.low_stock_threshold || '10',
    sku: item.sku || '',
    barcode: item.barcode || '',
    prescription_required: item.prescription_required || '',
    description: item.description || item.Description || '',
  };
}

function validateImportRow(row, existingSkus = new Set()) {
  const issues = [];
  if (!row.name) issues.push('Missing product name');
  const price = parseFloat(row.price);
  if (row.price === '' || Number.isNaN(price) || price < 0) issues.push('Invalid price');
  const stock = parseInt(row.stock, 10);
  if (Number.isNaN(stock) || stock < 0) issues.push('Negative stock');
  if (row.category && !isKnownCategory(row.category) && row.category.toLowerCase() !== 'general') {
    issues.push('Unknown category');
  }
  if (row.sku && existingSkus.has(String(row.sku).toLowerCase())) issues.push('Duplicate SKU');
  const sale = row.sale_price === '' ? null : parseFloat(row.sale_price);
  if (sale != null && !Number.isNaN(sale) && sale > price) issues.push('Sale price exceeds retail price');
  return issues;
}

async function ensureInventory(tx, vendorId, productId, available = 0) {
  const existing = await tx.productInventory.findUnique({ where: { product_id: productId } });
  if (existing) return existing;
  return tx.productInventory.create({
    data: {
      vendor_id: vendorId,
      product_id: productId,
      available_quantity: Math.max(0, Number(available) || 0),
    },
  });
}

async function writeTransaction(tx, payload) {
  return tx.inventoryTransaction.create({
    data: {
      vendor_id: payload.vendorId,
      product_id: payload.productId,
      batch_id: payload.batchId || null,
      type: payload.type,
      quantity: payload.quantity,
      reference_type: payload.referenceType || null,
      reference_id: payload.referenceId || null,
      reason: payload.reason || null,
      performed_by: payload.performedBy || null,
    },
  });
}

async function syncProductStock(tx, productId, available) {
  const listingStatus = available <= 0 ? undefined : undefined;
  const product = await tx.product.findUnique({ where: { id: productId } });
  const nextListing =
    available <= 0 && product?.listing_status === 'ACTIVE' ? product.listing_status : product?.listing_status;
  return tx.product.update({
    where: { id: productId },
    data: {
      stock: Math.max(0, available),
      listing_status: nextListing,
    },
  });
}

async function maybeNotifyLowStock(vendorId, product) {
  const threshold = Number(product.low_stock_threshold ?? 10);
  if (product.stock > 0 && product.stock <= threshold) {
    await vendorNotificationsService.createVendorNotification({
      vendorId,
      type: 'low_stock',
      title: 'Low stock',
      message: `${product.name} is at ${product.stock} units.`,
      data: { productId: product.id },
    });
  }
  if (product.stock <= 0) {
    await vendorNotificationsService.createVendorNotification({
      vendorId,
      type: 'out_of_stock',
      title: 'Out of stock',
      message: `${product.name} is out of stock.`,
      data: { productId: product.id },
    });
  }
}

const validateBulkRows = async (vendorId, csvText) => {
  const parsedItems = parseCSV(csvText).map(mapImportRow);
  const existing = await prisma.product.findMany({
    where: { vendor_id: vendorId, deleted_at: null, sku: { not: null } },
    select: { sku: true },
  });
  const existingSkus = new Set(existing.map((row) => String(row.sku).toLowerCase()));
  const seen = new Set(existingSkus);

  return parsedItems.map((row) => {
    const issues = validateImportRow(row, seen);
    if (row.sku) seen.add(String(row.sku).toLowerCase());
    return {
      ...row,
      category: normalizeCategoryName(row.category) || row.category,
      validation: issues.length ? issues.join('; ') : 'OK',
      valid: issues.length === 0,
    };
  });
};

const bulkImport = async (vendorId, csvText, { importValidOnly = true } = {}) => {
  const rows = await validateBulkRows(vendorId, csvText);
  if (!rows.length) {
    throw new AppError('CSV file is empty or formatted incorrectly', 400);
  }

  const importedProducts = [];
  const skipped = [];

  for (const row of rows) {
    if (!row.valid) {
      skipped.push(row);
      if (!importValidOnly) {
        throw new AppError(`Row ${row.row}: ${row.validation}`, 400);
      }
      continue;
    }

    const payload = sanitizeProductPayload(
      {
        name: row.name,
        formula: row.generic_name,
        generic_name: row.generic_name,
        brand_name: row.brand_name,
        manufacturer: row.manufacturer,
        category: row.category,
        subcategory: row.subcategory,
        dosage_form: row.dosage_form,
        strength: row.strength,
        pack_size: row.pack_size,
        price: parseFloat(row.price),
        sale_price: row.sale_price === '' ? undefined : parseFloat(row.sale_price),
        stock: parseInt(row.stock, 10) || 0,
        low_stock_threshold: parseInt(row.low_stock_threshold, 10) || 10,
        sku: row.sku,
        barcode: row.barcode,
        prescription_required: row.prescription_required,
        description: row.description,
      },
      { forCreate: true }
    );

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...payload,
          vendor_id: vendorId,
          approval_status: 'pending_review',
        },
      });
      await ensureInventory(tx, vendorId, created.id, created.stock);
      if (created.stock > 0) {
        await writeTransaction(tx, {
          vendorId,
          productId: created.id,
          type: 'STOCK_IN',
          quantity: created.stock,
          reason: 'Bulk import',
          performedBy: vendorId,
        });
      }
      return created;
    });

    importedProducts.push(product);
  }

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'PRODUCTS_BULK_IMPORTED',
    entity: 'product',
    details: { imported: importedProducts.length, skipped: skipped.length },
  });

  return {
    count: importedProducts.length,
    skipped: skipped.length,
    skippedRows: skipped,
    products: importedProducts,
  };
};

const updateStock = async (vendorId, productId, stock, options = {}) => {
  const reason = options.reason || 'Manual stock update';
  const product = await prisma.product.findFirst({
    where: { id: productId, vendor_id: vendorId, deleted_at: null },
  });
  if (!product) throw new AppError('Product not found', 404);

  const nextStock = Math.max(0, Number(stock));
  const delta = nextStock - Number(product.stock || 0);

  const updated = await prisma.$transaction(async (tx) => {
    await ensureInventory(tx, vendorId, productId, product.stock);
    const inventory = await tx.productInventory.update({
      where: { product_id: productId },
      data: {
        available_quantity: nextStock,
      },
    });
    if (inventory.available_quantity < 0) {
      throw new AppError('Insufficient stock for this order', 409);
    }
    const saved = await syncProductStock(tx, productId, nextStock);
    if (delta !== 0) {
      await writeTransaction(tx, {
        vendorId,
        productId,
        type: 'MANUAL_ADJUSTMENT',
        quantity: delta,
        reason,
        performedBy: options.performedBy || vendorId,
      });
    }
    return saved;
  });

  await recordAuditEntry({
    vendorId,
    userId: options.performedBy || vendorId,
    action: 'STOCK_UPDATED',
    entity: 'product',
    entityId: productId,
    details: { from: product.stock, to: nextStock, reason },
  });

  await maybeNotifyLowStock(vendorId, updated);
  return updated;
};

const adjustInventory = async (vendorId, productId, { type, quantity, reason, batchId, performedBy }) => {
  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty === 0) {
    throw new AppError('Quantity must be a non-zero integer', 400);
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, vendor_id: vendorId, deleted_at: null },
    include: { inventory: true, batches: true },
  });
  if (!product) throw new AppError('Product not found', 404);

  const updated = await prisma.$transaction(async (tx) => {
    await ensureInventory(tx, vendorId, productId, product.stock);
    const inventory = await tx.productInventory.findUnique({ where: { product_id: productId } });

    const patch = {};
    let availableDelta = 0;
    if (type === 'DAMAGED') {
      patch.damaged_quantity = { increment: Math.abs(qty) };
      availableDelta = -Math.abs(qty);
    } else if (type === 'EXPIRED') {
      patch.expired_quantity = { increment: Math.abs(qty) };
      availableDelta = -Math.abs(qty);
    } else if (type === 'RETURN') {
      availableDelta = Math.abs(qty);
    } else if (type === 'STOCK_IN') {
      availableDelta = Math.abs(qty);
    } else {
      availableDelta = qty;
      type = 'MANUAL_ADJUSTMENT';
    }

    if (inventory.available_quantity + availableDelta < 0) {
      throw new AppError('Unable to update inventory.', 409);
    }

    const next = await tx.productInventory.update({
      where: { product_id: productId },
      data: {
        ...patch,
        available_quantity: { increment: availableDelta },
      },
    });

    if (batchId) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: batchId, vendor_id: vendorId, product_id: productId },
      });
      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.quantity_available + availableDelta < 0) {
        throw new AppError('Unable to update inventory.', 409);
      }
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { quantity_available: { increment: availableDelta } },
      });
    }

    await writeTransaction(tx, {
      vendorId,
      productId,
      batchId,
      type,
      quantity: availableDelta,
      reason,
      performedBy: performedBy || vendorId,
    });
    return syncProductStock(tx, productId, next.available_quantity);
  });

  await recordAuditEntry({
    vendorId,
    userId: performedBy || vendorId,
    action: 'STOCK_UPDATED',
    entity: 'product',
    entityId: productId,
    details: { type, quantity: qty, reason },
  });

  return updated;
};

const listInventory = async (vendorId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  const search = String(query.search || '').trim();

  const products = await prisma.product.findMany({
    where: {
      vendor_id: vendorId,
      deleted_at: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { generic_name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { inventory: true },
    orderBy: { updated_at: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const total = await prisma.product.count({
    where: { vendor_id: vendorId, deleted_at: null },
  });

  return {
    items: products.map((product) => {
      const available = product.inventory?.available_quantity ?? product.stock;
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        available_quantity: available,
        reserved_quantity: product.inventory?.reserved_quantity || 0,
        sold_quantity: product.inventory?.sold_quantity || 0,
        damaged_quantity: product.inventory?.damaged_quantity || 0,
        expired_quantity: product.inventory?.expired_quantity || 0,
        low_stock_threshold: product.low_stock_threshold,
        status: deriveStockStatus({ ...product, inventory: { available_quantity: available } }),
        updated_at: product.inventory?.updated_at || product.updated_at,
      };
    }),
    page,
    pageSize,
    total,
  };
};

const listBatches = async (vendorId, query = {}) => {
  const productId = query.product_id || query.productId;
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      vendor_id: vendorId,
      ...(productId ? { product_id: productId } : {}),
    },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: [{ expiry_date: 'asc' }, { created_at: 'desc' }],
  });

  return batches.map((batch) => ({
    ...batch,
    expiry_class: classifyExpiry(batch.expiry_date),
    sellable: classifyExpiry(batch.expiry_date) !== 'Expired' && batch.quantity_available > 0,
  }));
};

const addBatch = async (vendorId, data, performedBy) => {
  if (!data.product_id || !data.batch_number) {
    throw new AppError('Product and batch number are required', 400);
  }
  const product = await prisma.product.findFirst({
    where: { id: data.product_id, vendor_id: vendorId, deleted_at: null },
  });
  if (!product) throw new AppError('Product not found', 404);

  const quantity = Math.max(0, Math.trunc(Number(data.quantity_received || data.quantity || 0)));
  const expiry = data.expiry_date ? new Date(data.expiry_date) : null;
  if (expiry && expiry < new Date()) {
    throw new AppError('Expired batches must not be sellable. Use a future expiry date or mark as expired.', 400);
  }

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryBatch.create({
      data: {
        vendor_id: vendorId,
        product_id: product.id,
        batch_number: String(data.batch_number).trim(),
        manufacturing_date: data.manufacturing_date ? new Date(data.manufacturing_date) : null,
        expiry_date: expiry,
        purchase_price: data.purchase_price != null ? Number(data.purchase_price) : null,
        quantity_received: quantity,
        quantity_available: quantity,
        supplier_name: data.supplier || data.supplier_name || null,
      },
    });
    await ensureInventory(tx, vendorId, product.id, product.stock);
    const inventory = await tx.productInventory.update({
      where: { product_id: product.id },
      data: { available_quantity: { increment: quantity } },
    });
    await syncProductStock(tx, product.id, inventory.available_quantity);
    await writeTransaction(tx, {
      vendorId,
      productId: product.id,
      batchId: created.id,
      type: 'STOCK_IN',
      quantity,
      reason: data.reason || 'Batch received',
      performedBy: performedBy || vendorId,
    });
    return created;
  });

  await recordAuditEntry({
    vendorId,
    userId: performedBy || vendorId,
    action: 'BATCH_ADDED',
    entity: 'inventory_batch',
    entityId: batch.id,
    details: { product_id: product.id, quantity },
  });

  return batch;
};

const allocateFefo = async (tx, vendorId, productId, quantity, meta = {}) => {
  const batches = await tx.inventoryBatch.findMany({
    where: { vendor_id: vendorId, product_id: productId },
  });
  if (!batches.length) return { remaining: quantity, allocations: [] };

  const { allocations, remaining } = pickFefoBatch(batches, quantity);
  for (const allocation of allocations) {
    await tx.inventoryBatch.update({
      where: { id: allocation.batch.id },
      data: { quantity_available: { decrement: allocation.quantity } },
    });
    await writeTransaction(tx, {
      vendorId,
      productId,
      batchId: allocation.batch.id,
      type: meta.type || 'ORDER_RESERVED',
      quantity: -allocation.quantity,
      referenceType: meta.referenceType,
      referenceId: meta.referenceId,
      performedBy: meta.performedBy,
    });
  }
  return { remaining, allocations };
};

const applyOrderStockChange = async (tx, { vendorId, productId, quantity, type, referenceId, performedBy }) => {
  await ensureInventory(tx, vendorId, productId, 0);
  const inventory = await tx.productInventory.findUnique({ where: { product_id: productId } });
  let availableDelta = 0;
  let reservedDelta = 0;
  let soldDelta = 0;

  if (type === 'ORDER_RESERVED') {
    if (inventory.available_quantity < quantity) {
      throw new AppError('Insufficient stock for this order.', 409);
    }
    availableDelta = -quantity;
    reservedDelta = quantity;
    await allocateFefo(tx, vendorId, productId, quantity, { type, referenceType: 'order', referenceId, performedBy });
  } else if (type === 'ORDER_RELEASED') {
    availableDelta = quantity;
    reservedDelta = -Math.min(inventory.reserved_quantity, quantity);
  } else if (type === 'SALE') {
    reservedDelta = -Math.min(inventory.reserved_quantity, quantity);
    soldDelta = quantity;
  }

  const nextAvailable = inventory.available_quantity + availableDelta;
  const nextReserved = inventory.reserved_quantity + reservedDelta;
  if (nextAvailable < 0 || nextReserved < 0) {
    throw new AppError('Insufficient stock for this order.', 409);
  }

  await tx.productInventory.update({
    where: { product_id: productId },
    data: {
      available_quantity: nextAvailable,
      reserved_quantity: nextReserved,
      sold_quantity: { increment: soldDelta },
    },
  });
  await syncProductStock(tx, productId, nextAvailable);
  await writeTransaction(tx, {
    vendorId,
    productId,
    type,
    quantity: type === 'SALE' ? -quantity : availableDelta || quantity,
    referenceType: 'order',
    referenceId,
    performedBy,
  });
};

const getLowStock = async (vendorId, threshold) => {
  const products = await prisma.product.findMany({
    where: { vendor_id: vendorId, deleted_at: null },
    include: { inventory: true },
    orderBy: { stock: 'asc' },
  });
  return products.filter((product) => {
    const available = product.inventory?.available_quantity ?? product.stock;
    const limit = threshold != null ? Number(threshold) : Number(product.low_stock_threshold ?? 10);
    return available <= limit;
  });
};

const listExpiring = async (vendorId) => {
  const batches = await listBatches(vendorId);
  return batches.filter((batch) => batch.expiry_class !== 'Healthy');
};

const syncInventory = async (vendorId) => {
  const products = await prisma.product.findMany({
    where: { vendor_id: vendorId, deleted_at: null },
    include: { inventory: true, batches: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      await ensureInventory(tx, vendorId, product.id, product.stock);
      const expiredQty = (product.batches || [])
        .filter((batch) => classifyExpiry(batch.expiry_date) === 'Expired')
        .reduce((sum, batch) => sum + Number(batch.quantity_available || 0), 0);
      if (expiredQty > 0) {
        for (const batch of product.batches) {
          if (classifyExpiry(batch.expiry_date) === 'Expired' && batch.quantity_available > 0) {
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { quantity_available: 0 },
            });
          }
        }
        const inventory = await tx.productInventory.update({
          where: { product_id: product.id },
          data: {
            available_quantity: { decrement: expiredQty },
            expired_quantity: { increment: expiredQty },
          },
        });
        const available = Math.max(0, inventory.available_quantity);
        if (inventory.available_quantity < 0) {
          await tx.productInventory.update({
            where: { product_id: product.id },
            data: { available_quantity: 0 },
          });
        }
        await syncProductStock(tx, product.id, available);
        await writeTransaction(tx, {
          vendorId,
          productId: product.id,
          type: 'EXPIRED',
          quantity: -expiredQty,
          reason: 'Expiry sync',
          performedBy: vendorId,
        });
      }
    }
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'INVENTORY_SYNC',
    entity: 'VendorProduct',
    details: { productsCount: products.length },
  });

  return {
    syncedAt: new Date().toISOString(),
    productsVerifiedCount: products.length,
  };
};

module.exports = {
  parseCSV,
  mapImportRow,
  validateImportRow,
  validateBulkRows,
  bulkImport,
  updateStock,
  adjustInventory,
  listInventory,
  listBatches,
  addBatch,
  applyOrderStockChange,
  getLowStock,
  listExpiring,
  syncInventory,
  ensureInventory,
};
