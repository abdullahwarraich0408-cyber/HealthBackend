const { z } = require('zod');

const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(3).max(50),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.number().positive(),
    min_order_amount: z.number().nonnegative().optional(),
    max_discount_amount: z.number().positive().optional(),
    start_date: z.string().datetime(),
    expiry_date: z.string().datetime(),
    usage_limit: z.number().int().positive().optional()
  })
});

const validateCouponSchema = z.object({
  params: z.object({
    code: z.string().min(3).max(50)
  }),
  query: z.object({
    orderAmount: z.string().optional().transform(val => val ? parseFloat(val) : 0)
  }).optional()
});

module.exports = {
  createCouponSchema,
  validateCouponSchema
};
