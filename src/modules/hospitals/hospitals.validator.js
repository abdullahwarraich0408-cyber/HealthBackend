const { z } = require('zod');

const hospitalBodySchema = z.object({
  name: z.string().min(2),
  logo: z.string().optional(),
  cover_image: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

const createHospitalSchema = z.object({
  body: hospitalBodySchema,
});

const updateHospitalSchema = z.object({
  body: hospitalBodySchema.partial(),
});

const hospitalStatusSchema = z.object({
  body: z.object({
    is_active: z.boolean(),
  }),
});

module.exports = {
  createHospitalSchema,
  updateHospitalSchema,
  hospitalStatusSchema,
};
