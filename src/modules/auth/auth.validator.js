const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2),
    role: z.enum(['customer']).optional(), // Usually vendors register via a different flow, but we can keep it flexible
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string()
  })
});

const partnerLoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
    portal: z.enum(['vendor', 'doctor', 'lab']),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  partnerLoginSchema,
};
