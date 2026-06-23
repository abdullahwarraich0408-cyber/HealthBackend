const { z } = require('zod');

const profileDataSchema = z.object({
  dob: z.string().optional(),
  bloodGroup: z.string().optional(),
  familyMembers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    relation: z.string(),
    age: z.union([z.number(), z.string()]).optional(),
    bloodGroup: z.string().optional(),
  })).optional(),
  medicalRecords: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    date: z.string().optional(),
    lab: z.string().optional(),
    fileUrl: z.string().optional(),
  })).optional(),
  paymentMethods: z.array(z.object({
    id: z.string(),
    type: z.string(),
    label: z.string(),
    expiry: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
  recentNotifications: z.array(z.object({
    id: z.string(),
    title: z.string(),
    message: z.string(),
    time: z.string(),
    read: z.boolean(),
  })).optional(),
});

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    profile_data: profileDataSchema.optional(),
  })
});

const changePasswordSchema = z.object({
  body: z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8),
  })
});

const addAddressSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    street: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
    postal_code: z.string().min(1),
    is_default: z.boolean().optional()
  })
});

const editAddressSchema = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    street: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    postal_code: z.string().min(1).optional(),
    is_default: z.boolean().optional()
  })
});

const updateNotificationPreferencesSchema = z.object({
  body: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    push: z.boolean().optional()
  })
});

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
  addAddressSchema,
  editAddressSchema,
  updateNotificationPreferencesSchema
};
