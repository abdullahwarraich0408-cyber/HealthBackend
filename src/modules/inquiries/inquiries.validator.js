const { z } = require('zod');

const createInquirySchema = z.object({
  body: z.object({
    first_name: z.string().min(1).max(80),
    last_name: z.string().max(80).optional().default(''),
    email: z.string().email(),
    phone: z.string().max(30).optional().nullable(),
    type: z
      .enum(['general', 'order', 'partner', 'business', 'callback', 'other'])
      .optional()
      .default('general'),
    subject: z.string().max(160).optional().default(''),
    message: z.string().min(4).max(4000),
  }),
});

const updateInquirySchema = z.object({
  body: z.object({
    status: z.enum(['new', 'in_progress', 'resolved']).optional(),
  }),
});

module.exports = {
  createInquirySchema,
  updateInquirySchema,
};
