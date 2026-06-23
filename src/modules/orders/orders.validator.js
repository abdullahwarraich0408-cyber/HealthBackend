const { z } = require('zod');

const createOrderSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      product_id: z.string(),
      quantity: z.number().int().positive(),
      unit_price: z.number().positive() // Depending on design, you might fetch price from DB instead of accepting it from client to prevent manipulation
    })),
    delivery_address: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string()
    })
  })
});

const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
  })
});

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema
};
