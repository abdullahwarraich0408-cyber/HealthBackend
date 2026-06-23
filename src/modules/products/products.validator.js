const { z } = require('zod');

const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    formula: z.string().optional(),
    description: z.string().optional(),
    price: z.number().positive(),
    stock: z.number().int().nonnegative(),
    category: z.string().optional(),
    image_url: z.string().url().optional().or(z.string().length(0))
  })
});

const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    formula: z.string().optional(),
    description: z.string().optional(),
    price: z.number().positive().optional(),
    stock: z.number().int().nonnegative().optional(),
    category: z.string().optional(),
    image_url: z.string().url().optional().or(z.string().length(0))
  })
});

module.exports = {
  createProductSchema,
  updateProductSchema
};
