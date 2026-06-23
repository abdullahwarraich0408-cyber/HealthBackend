const { z } = require('zod');

const addToCartSchema = z.object({
  body: z.object({
    product_id: z.string(),
    quantity: z.number().int().positive()
  })
});

const updateCartItemSchema = z.object({
  params: z.object({
    itemId: z.string()
  }),
  body: z.object({
    quantity: z.number().int().positive()
  })
});

const mergeCartSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        product_id: z.string().optional(),
        productId: z.string().optional(),
        quantity: z.number().int().positive()
      })
    )
  })
});

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
  mergeCartSchema
};
