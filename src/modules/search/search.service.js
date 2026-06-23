const prisma = require('../../config/database');
const redis = require('../../config/redis');
const meiliClient = require('../../config/meilisearch');

const trackSearch = async (query) => {
  if (!query || query.trim() === '') return;
  const normalized = query.trim().toLowerCase();
  try {
    await redis.zincrby('trending_searches', 1, normalized);
  } catch (err) {
    console.error('Failed to track search query in Redis', err);
  }
};

const getTrendingSearches = async () => {
  try {
    const trending = await redis.zrevrange('trending_searches', 0, 9);
    if (trending && trending.length > 0) {
      return trending;
    }
  } catch (err) {
    console.error('Failed to get trending searches from Redis', err);
  }
  return ['paracetamol', 'panadol', 'amoxicillin', 'insulin', 'mask', 'multivitamin', 'cough syrup'];
};

const getSearchFilters = async () => {
  // Aggregate price range
  const priceRange = await prisma.product.aggregate({
    _min: { price: true },
    _max: { price: true }
  });

  // Get distinct categories
  const categoriesRaw = await prisma.product.groupBy({
    by: ['category'],
    where: { category: { not: null } }
  });
  const categories = categoriesRaw.map(c => c.category);

  // Get distinct formulas (manufacturers/brands fallback)
  const formulasRaw = await prisma.product.groupBy({
    by: ['formula'],
    where: { formula: { not: null } }
  });
  const formulas = formulasRaw.map(f => f.formula);

  return {
    categories,
    formulas,
    priceRange: {
      min: priceRange._min.price || 0,
      max: priceRange._max.price || 0
    }
  };
};

const advancedSearch = async (filters) => {
  const { query, category, formula, minPrice, maxPrice, sortBy, page = 1, limit = 10 } = filters;
  const skip = (page - 1) * limit;

  const where = {};

  if (query && query.trim() !== '') {
    const trimmed = query.trim();
    await trackSearch(trimmed);
    where.OR = [
      { name: { contains: trimmed, mode: 'insensitive' } },
      { formula: { contains: trimmed, mode: 'insensitive' } },
      { description: { contains: trimmed, mode: 'insensitive' } }
    ];
  }

  if (category) {
    where.category = category;
  }

  if (formula) {
    where.formula = formula;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined) where.price.gte = minPrice;
    if (maxPrice !== undefined) where.price.lte = maxPrice;
  }

  let orderBy = { created_at: 'desc' };
  if (sortBy === 'price_asc') {
    orderBy = { price: 'asc' };
  } else if (sortBy === 'price_desc') {
    orderBy = { price: 'desc' };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { vendor: { select: { business_name: true } } }
    }),
    prisma.product.count({ where })
  ]);

  return {
    products,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const autocomplete = async (q) => {
  if (!q || q.trim() === '') return [];
  const trimmed = q.trim();

  const products = await prisma.product.findMany({
    where: {
      name: { contains: trimmed, mode: 'insensitive' }
    },
    take: 8,
    select: {
      id: true,
      name: true,
      category: true,
      price: true
    }
  });

  return products.map(p => ({
    id: p.id,
    label: p.name,
    category: p.category,
    price: p.price
  }));
};

const multiSearch = async (query) => {
  try {
    if (query) await trackSearch(query);
    const results = await meiliClient.multiSearch({
      queries: [
        { indexUid: 'products', q: query, limit: 10 },
        { indexUid: 'vendors', q: query, limit: 5 }
      ]
    });
    return results;
  } catch (error) {
    console.warn("Meilisearch failed, falling back to PostgreSQL search", error);
    // Postgres FTS/Contains fallback
    const products = await prisma.product.findMany({
      where: query ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { formula: { contains: query, mode: 'insensitive' } }
        ]
      } : {},
      take: 10
    });
    return {
      results: [
        { indexUid: 'products', hits: products }
      ]
    };
  }
};

module.exports = {
  multiSearch,
  getSearchFilters,
  advancedSearch,
  autocomplete,
  getTrendingSearches
};
