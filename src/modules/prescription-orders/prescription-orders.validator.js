const { z } = require('zod');

const createOrderSchema = z.object({
  body: z.object({
    delivery_address: z.union([z.string(), z.record(z.any())]),
    delivery_type: z.enum(['express', 'standard']).optional(),
    medicines: z.union([z.string(), z.array(z.object({
      name: z.string().min(1),
      quantity: z.number().int().positive().optional(),
      unit_price: z.number().nonnegative().optional(),
      product_id: z.string().uuid().optional(),
    }))]).optional(),
  }),
});

const orderIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const confirmStockSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    stock_status: z.enum(['all_available', 'partial', 'unavailable']).optional(),
    items: z.array(z.object({
      id: z.string().uuid(),
      availability: z.enum(['available', 'unavailable']),
    })).optional(),
  }),
});

const customerConfirmSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    confirmed: z.boolean().optional(),
  }),
});

const updateStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['packed', 'rider_assigned', 'out_for_delivery', 'delivered']),
  }),
});

module.exports = {
  createOrderSchema,
  orderIdSchema,
  confirmStockSchema,
  customerConfirmSchema,
  updateStatusSchema,
};
