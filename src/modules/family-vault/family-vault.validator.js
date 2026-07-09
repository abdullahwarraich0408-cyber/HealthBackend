const { z } = require('zod');

const optionalDate = z.union([z.string().datetime(), z.string().date(), z.coerce.date()]).optional().nullable();

const medicalProfileSchema = z.object({
  conditions: z.array(z.object({
    name: z.string(),
    diagnosisDate: z.string().optional(),
  })).optional(),
  allergies: z.object({
    medicine: z.array(z.object({ name: z.string(), severity: z.string().optional(), reaction: z.string().optional() })).optional(),
    food: z.array(z.object({ name: z.string(), severity: z.string().optional(), reaction: z.string().optional() })).optional(),
    environmental: z.array(z.object({ name: z.string(), severity: z.string().optional(), reaction: z.string().optional() })).optional(),
  }).optional(),
  surgeries: z.array(z.object({
    procedure: z.string(),
    hospital: z.string().optional(),
    date: z.string().optional(),
    doctor: z.string().optional(),
  })).optional(),
  familyHistory: z.array(z.object({ condition: z.string(), relation: z.string().optional() })).optional(),
  lifestyle: z.object({
    smoking: z.string().optional(),
    alcohol: z.string().optional(),
    exercise: z.string().optional(),
    diet: z.string().optional(),
    sleep: z.string().optional(),
    occupation: z.string().optional(),
  }).optional(),
}).optional();

const emergencyProfileSchema = z.object({
  bloodGroup: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  currentMedicines: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  emergencyContact: z.string().optional(),
  insurance: z.string().optional(),
  primaryDoctor: z.string().optional(),
}).optional();

const createFamilySchema = z.object({
  body: z.object({
    name: z.string().optional(),
    home_address: z.string().optional(),
    emergency_contact: z.string().optional(),
    preferred_hospital: z.string().optional(),
    preferred_pharmacy: z.string().optional(),
    preferred_lab: z.string().optional(),
  }),
});

const updateFamilySchema = z.object({
  body: z.object({
    name: z.string().optional(),
    home_address: z.string().optional(),
    emergency_contact: z.string().optional(),
    preferred_hospital: z.string().optional(),
    preferred_pharmacy: z.string().optional(),
    preferred_lab: z.string().optional(),
    notification_prefs: z.record(z.boolean()).optional(),
  }),
});

const createMemberSchema = z.object({
  body: z.object({
    full_name: z.string().min(1),
    relationship: z.string().min(1),
    gender: z.string().optional(),
    date_of_birth: optionalDate,
    blood_group: z.string().optional(),
    height_cm: z.coerce.number().positive().optional(),
    weight_kg: z.coerce.number().positive().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    access_role: z.enum(['admin', 'adult_member', 'caregiver', 'viewer']).optional(),
    can_view: z.boolean().optional(),
    can_edit: z.boolean().optional(),
    medical_profile: medicalProfileSchema,
    emergency_profile: emergencyProfileSchema,
  }),
});

const updateMemberSchema = z.object({
  params: z.object({ memberId: z.string().uuid() }),
  body: createMemberSchema.shape.body.partial(),
});

const timelineSchema = z.object({
  body: z.object({
    event_type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    event_date: z.union([z.string().datetime(), z.string().date(), z.coerce.date()]),
    metadata: z.record(z.unknown()).optional(),
    file_url: z.string().url().optional().or(z.literal('')),
  }),
});

const medicineSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    dose: z.string().optional(),
    morning: z.boolean().optional(),
    afternoon: z.boolean().optional(),
    night: z.boolean().optional(),
    start_date: optionalDate,
    end_date: optionalDate,
    refills_remaining: z.coerce.number().int().min(0).optional(),
    prescribing_doctor: z.string().optional(),
    pharmacy: z.string().optional(),
    instructions: z.string().optional(),
    purpose: z.string().optional(),
    adherence_log: z.record(z.unknown()).optional(),
  }),
});

const labReportSchema = z.object({
  body: z.object({
    category: z.string().min(1),
    title: z.string().min(1),
    report_date: z.union([z.string().datetime(), z.string().date(), z.coerce.date()]),
    file_url: z.string().optional(),
    lab_name: z.string().optional(),
    ai_summary: z.string().optional(),
    extracted_values: z.record(z.unknown()).optional(),
  }),
});

const vaccinationSchema = z.object({
  body: z.object({
    vaccine_name: z.string().min(1),
    dose: z.string().optional(),
    vaccinated_at: z.union([z.string().datetime(), z.string().date(), z.coerce.date()]),
    hospital: z.string().optional(),
    next_due: optionalDate,
  }),
});

const vitalSchema = z.object({
  body: z.object({
    vital_type: z.string().min(1),
    value: z.string().min(1),
    unit: z.string().optional(),
    recorded_at: z.union([z.string().datetime(), z.string().date(), z.coerce.date()]),
    notes: z.string().optional(),
  }),
});

const doctorSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    specialty: z.string().optional(),
    clinic: z.string().optional(),
    hospital: z.string().optional(),
    phone: z.string().optional(),
    is_primary: z.boolean().optional(),
    last_visit: optionalDate,
    next_appointment: optionalDate,
    notes: z.string().optional(),
  }),
});

const appointmentSchema = z.object({
  body: z.object({
    doctor_name: z.string().min(1),
    specialty: z.string().optional(),
    reason: z.string().optional(),
    diagnosis: z.string().optional(),
    prescription_url: z.string().optional(),
    follow_up_date: optionalDate,
    payment: z.string().optional(),
    documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
    appointment_date: z.union([z.string().datetime(), z.string().date(), z.coerce.date()]),
  }),
});

const prescriptionSchema = z.object({
  body: z.object({
    file_url: z.string().min(1),
    file_type: z.enum(['photo', 'pdf']).optional(),
    ocr_data: z.record(z.unknown()).optional(),
  }),
});

const copilotQuerySchema = z.object({
  body: z.object({
    question: z.string().min(1).max(500),
  }),
});

const memberIdParam = z.object({
  params: z.object({ memberId: z.string().uuid() }),
});

const resourceIdParam = z.object({
  params: z.object({ memberId: z.string().uuid(), id: z.string().uuid() }),
});

const prescriptionIdParam = z.object({
  params: z.object({
    memberId: z.string().uuid(),
    prescriptionId: z.string().uuid(),
  }),
});

module.exports = {
  createFamilySchema,
  updateFamilySchema,
  createMemberSchema,
  updateMemberSchema,
  timelineSchema,
  medicineSchema,
  labReportSchema,
  vaccinationSchema,
  vitalSchema,
  doctorSchema,
  appointmentSchema,
  prescriptionSchema,
  copilotQuerySchema,
  memberIdParam,
  resourceIdParam,
  prescriptionIdParam,
};
