const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const { sanitizeProductPayload, publicProductFilter } = require('../pharmacy/product-payload');
const { isProductCustomerVisible, deriveStockStatus } = require('../pharmacy/availability');
const inventoryService = require('../inventory/inventory.service');

function withComputed(product) {
  if (!product) return product;
  const stockStatus = deriveStockStatus(product);
  return {
    ...product,
    generic_name: product.generic_name || product.formula,
    retail_price: product.retail_price ?? product.price,
    stock_status: stockStatus,
    available_quantity: product.inventory?.available_quantity ?? product.stock,
  };
}

async function assertUniqueIdentifiers(vendorId, payload, excludeId) {
  if (payload.sku) {
    const existing = await prisma.product.findFirst({
      where: {
        vendor_id: vendorId,
        sku: payload.sku,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new AppError('A product with this SKU already exists', 409);
  }
  if (payload.barcode) {
    const existing = await prisma.product.findFirst({
      where: {
        vendor_id: vendorId,
        barcode: payload.barcode,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new AppError('A product with this barcode already exists', 409);
  }
  if (payload.name && payload.strength && payload.pack_size) {
    const existing = await prisma.product.findFirst({
      where: {
        vendor_id: vendorId,
        name: payload.name,
        strength: payload.strength,
        pack_size: payload.pack_size,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new AppError('A matching product with the same name, strength, and pack size already exists', 409);
    }
  }
}

const createProduct = async (vendorId, data) => {
  const submit = data.submit !== false && data.save_as_draft !== true && data.approval_status !== 'draft';
  const sanitizedData = sanitizeProductPayload(data, { forCreate: true });
  await assertUniqueIdentifiers(vendorId, sanitizedData);

  if (sanitizedData.controlled_medicine && submit) {
    throw new AppError('Controlled medicines require administrative validation before submission', 400);
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...sanitizedData,
        vendor_id: vendorId,
        approval_status: submit ? 'pending_review' : 'draft',
        review_note: null,
        approved_at: null,
        reviewed_at: null,
        reviewed_by_account_id: null,
      },
    });
    await inventoryService.ensureInventory(tx, vendorId, created.id, created.stock);
    return created;
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: submit ? 'PRODUCT_SUBMITTED_FOR_REVIEW' : 'PRODUCT_CREATED',
    entity: 'product',
    entityId: product.id,
    details: { name: product.name, source: 'vendor_portal', approval_status: product.approval_status },
  });

  return withComputed(product);
};

const getProducts = async (query) => {
  const where = {
    ...publicProductFilter(),
  };
  if (query.vendor_id) where.vendor_id = query.vendor_id;
  if (query.category) where.category = query.category;

  const products = await prisma.product.findMany({
    where,
    include: {
      vendor: { select: { business_name: true, status: true, is_open: true, is_online: true, holiday_mode_enabled: true } },
      inventory: true,
      batches: true,
    },
    orderBy: { name: 'asc' },
  });

  return products.filter((product) => isProductCustomerVisible(product, product.vendor));
};

const getProductById = async (id) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      vendor: { select: { business_name: true, status: true, is_open: true, is_online: true, holiday_mode_enabled: true } },
      inventory: true,
      batches: true,
    },
  });

  if (!product || !isProductCustomerVisible(product, product.vendor)) {
    throw new AppError('Product not found', 404);
  }

  return withComputed(product);
};

const getVendorProductById = async (id, vendorId) => {
  const product = await prisma.product.findFirst({
    where: { id, vendor_id: vendorId, deleted_at: null },
    include: { inventory: true, batches: true },
  });
  if (!product) throw new AppError('Product not found', 404);
  return withComputed(product);
};

const listVendorProducts = async (vendorId, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = [10, 20, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 20;
  const search = String(query.search || '').trim();
  const sort = String(query.sort || 'newest');

  const orderBy = {
    newest: { created_at: 'desc' },
    oldest: { created_at: 'asc' },
    'name-asc': { name: 'asc' },
    'name-desc': { name: 'desc' },
    'price-asc': { price: 'asc' },
    'price-desc': { price: 'desc' },
    'stock-asc': { stock: 'asc' },
    'stock-desc': { stock: 'desc' },
  }[sort] || { created_at: 'desc' };

  const where = {
    vendor_id: vendorId,
    deleted_at: null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.approval_status ? { approval_status: query.approval_status } : {}),
    ...(query.listing_status ? { listing_status: query.listing_status } : {}),
    ...(query.prescription_required === 'true' ? { prescription_required: true } : {}),
    ...(query.prescription_required === 'false' ? { prescription_required: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { generic_name: { contains: search, mode: 'insensitive' } },
            { formula: { contains: search, mode: 'insensitive' } },
            { brand_name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { inventory: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  let filtered = items.map(withComputed);
  if (query.stock_status) {
    filtered = filtered.filter((item) => item.stock_status === query.stock_status);
  }

  return { items: filtered, page, pageSize, total };
};

const updateProduct = async (id, vendorId, data) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.deleted_at) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  const sanitizedData = sanitizeProductPayload(data);
  await assertUniqueIdentifiers(vendorId, { ...product, ...sanitizedData }, id);

  const submit = data.submit === true || data.approval_status === 'pending_review';
  const shouldResubmitForReview =
    submit || ['rejected', 'changes_requested', 'draft'].includes(product.approval_status);

  const nextApproval = submit
    ? 'pending_review'
    : data.approval_status === 'draft'
      ? 'draft'
      : shouldResubmitForReview && product.approval_status === 'rejected'
        ? 'pending_review'
        : undefined;

  const updatedProduct = await prisma.product.update({
    where: { id },
    data: {
      ...sanitizedData,
      ...(nextApproval
        ? {
            approval_status: nextApproval,
            review_note: nextApproval === 'pending_review' ? null : product.review_note,
            approved_at: nextApproval === 'approved' ? product.approved_at : null,
            reviewed_at: nextApproval === 'pending_review' ? null : product.reviewed_at,
            reviewed_by_account_id: nextApproval === 'pending_review' ? null : product.reviewed_by_account_id,
          }
        : {}),
    },
    include: { inventory: true },
  });

  if (sanitizedData.stock != null && sanitizedData.stock !== product.stock) {
    await inventoryService.updateStock(vendorId, id, sanitizedData.stock, { reason: 'Product form stock update' });
  }

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: nextApproval === 'pending_review' ? 'PRODUCT_SUBMITTED_FOR_REVIEW' : 'PRODUCT_UPDATED',
    entity: 'product',
    entityId: id,
    details: { updated_fields: Object.keys(sanitizedData) },
  });

  return withComputed(updatedProduct);
};

const setListingStatus = async (id, vendorId, listingStatus) => {
  const product = await prisma.product.findFirst({ where: { id, vendor_id: vendorId, deleted_at: null } });
  if (!product) throw new AppError('Product not found', 404);
  const updated = await prisma.product.update({
    where: { id },
    data: { listing_status: String(listingStatus).toUpperCase() },
  });
  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: listingStatus === 'ACTIVE' ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
    entity: 'product',
    entityId: id,
    details: { listing_status: updated.listing_status },
  });
  return withComputed(updated);
};

const duplicateProduct = async (id, vendorId) => {
  const product = await getVendorProductById(id, vendorId);
  const { id: _id, created_at, updated_at, inventory, batches, ...rest } = product;
  return createProduct(vendorId, {
    ...rest,
    name: `${product.name} (Copy)`,
    sku: product.sku ? `${product.sku}-COPY` : undefined,
    barcode: undefined,
    save_as_draft: true,
    stock: 0,
  });
};

const deleteProduct = async (id, vendorId) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  await prisma.product.update({
    where: { id },
    data: { deleted_at: new Date(), listing_status: 'ARCHIVED' },
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'PRODUCT_ARCHIVED',
    entity: 'product',
    entityId: id,
  });
};

const getAdminProducts = async () => prisma.product.findMany({
  where: { deleted_at: null },
  orderBy: { created_at: 'desc' },
  include: {
    vendor: { select: { business_name: true, email: true } },
  },
});

const reviewProduct = async (productId, accountId, approvalStatus, reviewNote = null) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);

  const normalized = String(approvalStatus || '').toLowerCase();
  if (!['approved', 'rejected', 'pending_review', 'changes_requested'].includes(normalized)) {
    throw new AppError('Invalid product approval status', 400);
  }

  const reviewedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      approval_status: normalized,
      review_note: reviewNote ? String(reviewNote).trim() : null,
      approved_at: normalized === 'approved' ? new Date() : null,
      reviewed_at: new Date(),
      reviewed_by_account_id: accountId,
      listing_status: normalized === 'approved' ? product.listing_status || 'ACTIVE' : product.listing_status,
    },
    include: {
      vendor: { select: { business_name: true, email: true } },
    },
  });

  await recordAuditEntry({
    vendorId: reviewedProduct.vendor_id,
    userId: accountId,
    action: `PRODUCT_${normalized.toUpperCase()}`,
    entity: 'product',
    entityId: productId,
    details: { note: reviewNote, name: reviewedProduct.name },
  });

  await vendorNotificationsService.createVendorNotification({
    vendorId: reviewedProduct.vendor_id,
    type: normalized === 'approved' ? 'product_approved' : 'product_rejected',
    title: normalized === 'approved' ? 'Product approved' : 'Product review update',
    message:
      normalized === 'approved'
        ? `${reviewedProduct.name} is approved and can be listed.`
        : `${reviewedProduct.name}: ${reviewNote || normalized.replace('_', ' ')}`,
    data: { productId },
  });

  return reviewedProduct;
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  getVendorProductById,
  listVendorProducts,
  updateProduct,
  setListingStatus,
  duplicateProduct,
  deleteProduct,
  getAdminProducts,
  reviewProduct,
};
