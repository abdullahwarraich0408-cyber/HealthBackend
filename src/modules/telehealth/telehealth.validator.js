const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.object({
    message: z.string().max(5000).optional(),
    message_type: z
      .enum(['text', 'image', 'pdf', 'lab_report', 'prescription', 'system'])
      .optional()
      .default('text'),
    attachment_url: z.string().min(1).optional(),
  }).refine((data) => data.message?.trim() || data.attachment_url, {
    message: 'Message or attachment is required',
  }),
});

module.exports = {
  sendMessageSchema,
};
