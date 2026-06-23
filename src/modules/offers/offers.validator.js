const { z } = require('zod');

const createOfferSchema = z.object({
  body: z.object({
    product_id: z.string().uuid(),
    discount_percentage: z.number().min(1).max(100),
    start_date: z.string().datetime(),
    expiry_date: z.string().datetime()
  })
});

module.exports = {
  createOfferSchema
};
