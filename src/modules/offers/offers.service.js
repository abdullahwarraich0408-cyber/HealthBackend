const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const createOffer = async (vendorId, offerData) => {
  const { product_id, discount_percentage, start_date, expiry_date } = offerData;

  // Verify product exists
  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) throw new AppError('Product not found', 404);

  // Verify product belongs to the vendor
  if (product.vendor_id !== vendorId) {
    throw new AppError('You do not have permission to create an offer for this product', 403);
  }

  // Validate discount percentage
  if (discount_percentage <= 0 || discount_percentage > 100) {
    throw new AppError('Discount percentage must be between 1 and 100', 400);
  }

  // Validate dates
  const start = new Date(start_date);
  const expiry = new Date(expiry_date);
  if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
    throw new AppError('Invalid start_date or expiry_date', 400);
  }
  if (expiry <= start) {
    throw new AppError('expiry_date must be after start_date', 400);
  }

  return prisma.offer.create({
    data: {
      vendor_id: vendorId,
      product_id,
      discount_percentage,
      start_date: start,
      expiry_date: expiry
    }
  });
};

module.exports = {
  createOffer
};
