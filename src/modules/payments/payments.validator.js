const { z } = require('zod');

module.exports = {
  checkoutSchema: z.object({
    body: z
      .object({
        purpose: z.enum(['order', 'appointment', 'lab']).optional().default('order'),
        order_ids: z.array(z.string()).optional(),
        total_amount: z.number().optional(),
        appointment_id: z.string().uuid().optional(),
        booking_ids: z.array(z.string()).optional(),
        order_group_id: z.string().optional(),
        payment_method: z.enum(['stripe', 'bankalfalah', 'cod', 'card']).optional(),
        frontend_url: z.string().url().optional(),
      })
      .superRefine((data, ctx) => {
        const purpose = data.purpose || 'order';
        if (purpose === 'order') {
          if (!data.order_ids?.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'order_ids is required for order checkout',
              path: ['order_ids'],
            });
          }
          if (typeof data.total_amount !== 'number') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'total_amount is required for order checkout',
              path: ['total_amount'],
            });
          }
        }
        if (purpose === 'appointment' && !data.appointment_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'appointment_id is required for appointment checkout',
            path: ['appointment_id'],
          });
        }
        if (purpose === 'lab' && !data.order_group_id && !data.booking_ids?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'booking_ids or order_group_id is required for lab checkout',
            path: ['booking_ids'],
          });
        }
      }),
  }),
};
