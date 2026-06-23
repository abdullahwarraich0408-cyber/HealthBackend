const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const { sendResponse } = require('../../utils/response');

const getCategories = catchAsync(async (req, res) => {
  // Extract distinct categories from the products table
  const distinctCategories = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category']
  });

  const categories = distinctCategories.map(c => c.category);
  sendResponse(res, 200, { categories }, 'Categories fetched successfully');
});

module.exports = {
  getCategories
};
