const { z } = require('zod');

const shareShape = z
  .object({
    share_prescriptions: z.boolean().optional(),
    share_lab_reports: z.boolean().optional(),
    share_medicines: z.boolean().optional(),
    share_documents: z.boolean().optional(),
  })
  .optional();

const updateConsultationSchema = z.object({
  body: z.object({
    symptoms: z.string().optional(),
    diagnosis: z.string().optional(),
    clinical_notes: z.string().optional(),
    follow_up_date: z.string().nullable().optional(),
    follow_up_notes: z.string().optional(),
  }),
});

const savePrescriptionSchema = z.object({
  body: z.object({
    appointment_id: z.string(),
    items: z.array(z.record(z.any())).min(1),
    notes: z.string().optional(),
    sign: z.boolean().optional(),
  }),
});

const orderLabTestSchema = z.object({
  body: z.object({
    appointment_id: z.string(),
    lab_test_id: z.string(),
    collection_type: z.enum(['HOME', 'VISIT_LAB']).optional(),
    time_slot: z.string().optional(),
    collection_date: z.string().optional(),
    notes: z.string().optional(),
  }),
});

const createDocumentSchema = z.object({
  body: z.object({
    document_type: z.string(),
    title: z.string().optional(),
    doctor_name: z.string().optional(),
    hospital_name: z.string().optional(),
    document_date: z.string().optional(),
    file_url: z.string(),
    notes: z.string().optional(),
  }),
});

module.exports = {
  shareShape,
  updateConsultationSchema,
  savePrescriptionSchema,
  orderLabTestSchema,
  createDocumentSchema,
};
