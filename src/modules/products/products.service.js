const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const createProduct = async (vendorId, data) => {
  const product = await prisma.product.create({
    data: {
      ...data,
      vendor_id: vendorId
    }
  });
  return product;
};

const getProducts = async (query) => {
  const where = {};
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

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return product;
};

const updateProduct = async (id, vendorId, data) => {
  // Verify ownership
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  const updatedProduct = await prisma.product.update({
    where: { id },
    data
  });

  return updatedProduct;
};

const deleteProduct = async (id, vendorId) => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.vendor_id !== vendorId) throw new AppError('You do not own this product', 403);

  await prisma.product.delete({ where: { id } });
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
