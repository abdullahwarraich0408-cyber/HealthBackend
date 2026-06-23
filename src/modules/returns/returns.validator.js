const { z } = require('zod');

const requestReturnSchema = z.object({
  body: z.object({
    order_id: z.string().uuid(),
    reason: z.string().min(5).max(1000)
  })
});

const updateReturnStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['approved', 'rejected']),
    notes: z.string().max(1000).optional()
  })
});

const processReturnSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    refund_amount: z.number().nonnegative(),
    notes: z.string().max(1000).optional()
  })
});

module.exports = {
  requestReturnSchema,
  updateReturnStatusSchema,
  processReturnSchema
};
