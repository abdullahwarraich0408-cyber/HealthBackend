const { z } = require('zod');

const createOrderSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      product_id: z.string(),
      quantity: z.number().int().positive(),
      unit_price: z.number().positive() // Depending on design, you might fetch price from DB instead of accepting it from client to prevent manipulation
    })),
    reservation_lock: z.string().optional(),
    delivery_address: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string()
    })
  })
});

const checkoutLockSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      product_id: z.string().optional(),
      productId: z.string().optional(),
      quantity: z.number().int().positive(),
    })).min(1),
  }),
});

const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.string().min(2),
    reason: z.string().optional(),
    rejection_reason: z.string().optional(),
    cancellation_reason: z.string().optional(),
    note: z.string().optional(),
  })
});

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  checkoutLockSchema,
};
