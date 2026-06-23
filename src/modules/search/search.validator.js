const { z } = require('zod');

const advancedSearchSchema = z.object({
  body: z.object({
    query: z.string().optional(),
    category: z.string().optional(),
    formula: z.string().optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    sortBy: z.enum(['price_asc', 'price_desc', 'newest']).optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional()
  })
});

const autocompleteSchema = z.object({
  query: z.object({
    q: z.string().min(1)
  })
});

module.exports = {
  advancedSearchSchema,
  autocompleteSchema
};
