const { z } = require('zod');

const addressSchema = z.object({
  line: z.string(),
  city: z.string(),
  phone: z.string(),
});

const patientSchema = z.object({
  patient_name: z.string().min(1),
  patient_gender: z.string().optional(),
  patient_age: z.coerce.number().int().positive().optional(),
});

const bookLabTestSchema = z.object({
  body: z.object({
    lab_test_id: z.string(),
    time_slot: z.string(),
    collection_date: z.string().optional(),
    collection_type: z.enum(['HOME', 'VISIT_LAB']).optional(),
    payment_method: z.string().optional(),
    prescription_url: z.string().url().optional().or(z.literal('')),
    collection_address: addressSchema.optional(),
    patient_name: z.string().optional(),
    patient_gender: z.string().optional(),
    patient_age: z.coerce.number().int().positive().optional(),
  }),
});

const createLabOrderSchema = z.object({
  body: z.object({
    lab_test_ids: z.array(z.string()).min(1),
    time_slot: z.string(),
    collection_date: z.string().optional(),
    collection_type: z.enum(['HOME', 'VISIT_LAB']).optional(),
    payment_method: z.string().optional(),
    prescription_url: z.string().url().optional().or(z.literal('')),
    collection_address: addressSchema.optional(),
    patient_name: z.string().min(1),
    patient_gender: z.string().optional(),
    patient_age: z.coerce.number().int().positive().optional(),
  }),
});

const updateBookingStatusSchema = z.object({
  body: z.object({
    status: z.enum([
      'pending',
      'confirmed',
      'collector_assigned',
      'sample_collected',
      'testing',
      'report_uploaded',
      'completed',
      'cancelled',
      'rejected',
    ]),
    note: z.string().optional(),
  }),
});

const uploadReportSchema = z.object({
  body: z.object({
    report_url: z.string().trim().min(1, 'Report URL is required'),
  }),
});

const assignCollectorSchema = z.object({
  body: z.object({
    collector_name: z.string().min(1),
    collector_phone: z.string().min(1),
  }),
});

module.exports = {
  bookLabTestSchema,
  createLabOrderSchema,
  updateBookingStatusSchema,
  uploadReportSchema,
  assignCollectorSchema,
};
