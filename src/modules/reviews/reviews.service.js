const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const fetchProductReviews = async (productId) => {
  // Verify product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);

  return prisma.review.findMany({
    where: { product_id: productId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });
};

const fetchVendorReviews = async (vendorId) => {
  // Verify vendor exists
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new AppError('Vendor not found', 404);

  return prisma.review.findMany({
    where: { vendor_id: vendorId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });
};

const submitReview = async (customerId, reviewData) => {
  const { product_id, vendor_id, rating, comment } = reviewData;

  if (!product_id && !vendor_id) {
    throw new AppError('A review must be associated with either a product or a vendor', 400);
  }
  if (product_id && vendor_id) {
    throw new AppError('A review cannot be associated with both a product and a vendor simultaneously', 400);
  }

  // Validate existence of entity
  if (product_id) {
    const product = await prisma.product.findUnique({ where: { id: product_id } });
    if (!product) throw new AppError('Product not found', 404);
  } else if (vendor_id) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendor_id } });
    if (!vendor) throw new AppError('Vendor not found', 404);
  }

  return prisma.review.create({
    data: {
      customer_id: customerId,
      product_id: product_id || null,
      vendor_id: vendor_id || null,
      rating,
      comment
    }
  });
};

const updateReview = async (customerId, reviewId, updateData) => {
  const { rating, comment } = updateData;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError('Review not found', 404);

  if (review.customer_id !== customerId) {
    throw new AppError('You do not have permission to update this review', 403);
  }

  return prisma.review.update({
    where: { id: reviewId },
    data: {
      rating,
      comment
    }
  });
};

const deleteReview = async (customerId, reviewId) => {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError('Review not found', 404);

  if (review.customer_id !== customerId) {
    throw new AppError('You do not have permission to delete this review', 403);
  }

  await prisma.review.delete({ where: { id: reviewId } });
};

module.exports = {
  fetchProductReviews,
  fetchVendorReviews,
  submitReview,
  updateReview,
  deleteReview
};
