const { z } = require('zod');

const bookAppointmentSchema = z.object({
  body: z.object({
    doctor_id: z.string(),
    slot: z.string(),
    appointment_date: z.string().optional(),
    payment_method: z.string().optional(),
    reason: z.string().optional(),
    preferred_consultation_mode: z.enum(['online', 'in_person']).optional(),
    hospital_id: z.string().optional(),
    practice_location_id: z.string().optional(),
  }),
});

const rescheduleAppointmentSchema = z.object({
  body: z.object({
    slot: z.string().optional(),
    appointment_date: z.string().optional(),
    reason: z.string().optional(),
  }),
});

const submitDoctorReviewSchema = z.object({
  body: z.object({
    appointment_id: z.string(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().optional(),
  }),
});

const updateSlotsSchema = z.object({
  body: z.object({
    slots: z.array(
      z.object({
        day: z.string(),
        slots: z.array(z.string()),
      })
    ),
  }),
});

const selectConsultationModeSchema = z.object({
  body: z.object({
    mode: z.enum(['online', 'in_person']),
  }),
});

module.exports = {
  bookAppointmentSchema,
  rescheduleAppointmentSchema,
  selectConsultationModeSchema,
  submitDoctorReviewSchema,
  updateSlotsSchema,
};
