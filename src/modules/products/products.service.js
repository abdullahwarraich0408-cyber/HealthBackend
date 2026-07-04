const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeProductPayload(data) {
  return {
    ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data.formula !== undefined ? { formula: normalizeOptionalString(data.formula) } : {}),
    ...(data.description !== undefined ? { description: normalizeOptionalString(data.description) } : {}),
    ...(data.price !== undefined ? { price: data.price } : {}),
    ...(data.stock !== undefined ? { stock: data.stock } : {}),
    ...(data.category !== undefined ? { category: normalizeOptionalString(data.category) } : {}),
    ...(data.image_url !== undefined ? { image_url: normalizeOptionalString(data.image_url) } : {}),
  };
}

const createProduct = async (vendorId, data) => {
  const sanitizedData = sanitizeProductPayload(data);
  const product = await prisma.product.create({
    data: {
      ...sanitizedData,
      vendor_id: vendorId,
      approval_status: 'pending_review',
      review_note: null,
      approved_at: null,
      reviewed_at: null,
      reviewed_by_account_id: null,
    }
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'PRODUCT_SUBMITTED_FOR_REVIEW',
    entity: 'product',
    entityId: product.id,
    details: {
      name: product.name,
      source: 'vendor_portal',
    },
  });

  return product;
};

const getProducts = async (query) => {
  const where = {
    approval_status: 'approved',
  };
  if (query.vendor_id) {
    where.vendor_id = query.vendor_id;
  }
  if (query.category) {
    where.category = query.category;
  }

  return prisma.product.findMany({
    where,
    include: { vendor: { select: { business_name: true } } },
    orderBy: { name: 'asc' },
  });
};

const getProductById = async (id) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { vendor: { select: { business_name: true } } }
  });

  if (!product || product.approval_status !== 'approved') {
    throw new AppError('Product not found', 404);
  }

  return product;
};

const updateProduct = async (id, vendorId, data) => {
  // Verify ownership
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  const sanitizedData = sanitizeProductPayload(data);
  const shouldResubmitForReview = product.approval_status === 'rejected';
  const updatedProduct = await prisma.product.update({
    where: { id },
    data: {
      ...sanitizedData,
      ...(shouldResubmitForReview
        ? {
            approval_status: 'pending_review',
            review_note: null,
            approved_at: null,
            reviewed_at: null,
            reviewed_by_account_id: null,
          }
        : {}),
    }
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: shouldResubmitForReview ? 'PRODUCT_RESUBMITTED_FOR_REVIEW' : 'PRODUCT_UPDATED',
    entity: 'product',
    entityId: id,
    details: {
      updated_fields: Object.keys(sanitizedData),
    },
  });

  return updatedProduct;
};

const deleteProduct = async (id, vendorId) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  await prisma.product.delete({ where: { id } });
};

const getAdminProducts = async () => prisma.product.findMany({
  orderBy: { created_at: 'desc' },
  include: {
    vendor: { select: { business_name: true, email: true } },
  },
});

const reviewProduct = async (productId, accountId, approvalStatus, reviewNote = null) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (!['approved', 'rejected', 'pending_review'].includes(approvalStatus)) {
    throw new AppError('Invalid product approval status', 400);
  }

  const reviewedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      approval_status: approvalStatus,
      review_note: normalizeOptionalString(reviewNote),
      approved_at: approvalStatus === 'approved' ? new Date() : null,
      reviewed_at: new Date(),
      reviewed_by_account_id: accountId,
    },
    include: {
      vendor: { select: { business_name: true, email: true } },
    },
  });

  await recordAuditEntry({
    vendorId: reviewedProduct.vendor_id,
    userId: accountId,
    action: `PRODUCT_${approvalStatus.toUpperCase()}`,
    entity: 'product',
    entityId: productId,
    details: {
      note: normalizeOptionalString(reviewNote),
      name: reviewedProduct.name,
    },
  });

  return reviewedProduct;
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getAdminProducts,
  reviewProduct,
};
