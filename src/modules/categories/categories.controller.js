const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const { sendResponse } = require('../../utils/response');

const { flattenCategories } = require('../pharmacy/catalog.constants');

const getCategories = catchAsync(async (req, res) => {
  const catalog = flattenCategories();
  const distinctCategories = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category']
  });
  const fromDb = distinctCategories.map((c) => c.category).filter(Boolean);
  const names = Array.from(new Set([...catalog.map((c) => c.name), ...fromDb]));
  sendResponse(res, 200, { categories: names, catalog }, 'Categories fetched successfully');
});

module.exports = {
  getCategories
};
