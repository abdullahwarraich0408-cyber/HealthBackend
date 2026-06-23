const { z } = require('zod');
module.exports = {
  checkoutSchema: z.object({
    body: z.object({
      order_ids: z.array(z.string()),
      total_amount: z.number(),
      payment_method: z.enum(['stripe', 'bankalfalah', 'cod']).optional(),
      frontend_url: z.string().url().optional(),
    })
  })
};
