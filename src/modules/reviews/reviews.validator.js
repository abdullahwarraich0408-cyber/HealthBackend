const { z } = require('zod');

const submitReviewSchema = z.object({
  body: z.object({
    product_id: z.string().uuid().optional(),
    vendor_id: z.string().uuid().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional()
  }).refine(data => data.product_id || data.vendor_id, {
    message: "A review must be associated with either product_id or vendor_id",
    path: ["product_id"]
  }).refine(data => !(data.product_id && data.vendor_id), {
    message: "A review cannot have both product_id and vendor_id",
    path: ["product_id"]
  })
});

const updateReviewSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional()
  })
});

module.exports = {
  submitReviewSchema,
  updateReviewSchema
};
