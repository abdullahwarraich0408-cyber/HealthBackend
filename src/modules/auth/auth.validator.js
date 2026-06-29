const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2),
    role: z.enum(['customer']).optional(),
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

const firebaseAuthSchema = z.object({
  body: z.object({
    idToken: z.string().min(10),
    deviceId: z.string().min(1).optional(),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  }),
});

const googleAuthSchema = firebaseAuthSchema;
const appleAuthSchema = firebaseAuthSchema;

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
    deviceId: z.string().optional(),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  }).optional(),
});

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    avatar: z.string().url().optional().or(z.literal('')),
    gender: z.string().optional(),
    dateOfBirth: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  }),
});

const devLoginSchema = z.object({
  body: z.object({
    phone: z.string().min(10),
    code: z.string().min(4),
    deviceId: z.string().optional(),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  partnerLoginSchema,
  firebaseAuthSchema,
  googleAuthSchema,
  appleAuthSchema,
  refreshSchema,
  updateProfileSchema,
  devLoginSchema,
};
