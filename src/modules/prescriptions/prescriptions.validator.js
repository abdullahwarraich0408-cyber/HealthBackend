const { z } = require('zod');

const uploadSchema = z.object({
  body: z.object({
    order_id: z.string().optional()
  })
});

const validatePrescriptionSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['verified', 'rejected']),
    notes: z.string().max(1000).optional()
  })
});

module.exports = {
  uploadSchema,
  validatePrescriptionSchema
};
