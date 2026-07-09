const { z } = require('zod');

const registerDeviceTokenSchema = z.object({
  body: z.object({
    fcmToken: z.string().min(10),
    deviceId: z.string().min(1),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  }),
});

module.exports = {
  registerDeviceTokenSchema,
};
