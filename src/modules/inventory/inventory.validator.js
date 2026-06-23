const { z } = require('zod');

const updateStockSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    stock: z.number().int().nonnegative()
  })
});

const lowStockSchema = z.object({
  query: z.object({
    threshold: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
  }).optional()
});

module.exports = {
  updateStockSchema,
  lowStockSchema
};
