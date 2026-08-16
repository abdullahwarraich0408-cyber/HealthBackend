const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const DOCUMENT_TYPES = [
  'prescription',
  'lab_report',
  'medical_document',
  'medical_image',
  'discharge_summary',
  'other',
];

const defaultShare = {
  share_prescriptions: true,
  share_lab_reports: true,
  share_medicines: true,
  share_documents: false,
};

const normalizeShare = (share = {}) => ({
  share_prescriptions: share.share_prescriptions !== false,
  share_lab_reports: share.share_lab_reports !== false,
  share_medicines: share.share_medicines !== false,
  share_documents: Boolean(share.share_documents),
});

const upsertRelationship = async (tx, doctorId, patientId, appointmentDate) => {
  const existing = await tx.doctorPatientRelationship.findUnique({
    where: {
      doctor_id_patient_id: { doctor_id: doctorId, patient_id: patientId },
    },
  });

  if (existing) {
    return tx.doctorPatientRelationship.update({
      where: { id: existing.id },
      data: {
        status: 'active',
        last_consultation: appointmentDate || existing.last_consultation,
        total_consultations: { increment: 1 },
      },
    });
  }

  return tx.doctorPatientRelationship.create({
    data: {
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      first_consultation: appointmentDate || new Date(),
      last_consultation: appointmentDate || new Date(),
      total_consultations: 1,
    },
  });
};

const onAppointmentCreated = async (appointment, shareSettings) => {
  const share = normalizeShare(shareSettings);
  const relationship = await prisma.$transaction(async (tx) => {
    const rel = await upsertRelationship(
      tx,
      appointment.doctor_id,
      appointment.customer_id,
      appointment.appointment_date
    );

    await tx.doctorAppointment.update({
      where: { id: appointment.id },
      data: { relationship_id: rel.id },
    });

    await tx.consultation.create({
      data: {
        appointment_id: appointment.id,
        relationship_id: rel.id,
        doctor_id: appointment.doctor_id,
        patient_id: appointment.customer_id,
        status: 'scheduled',
      },
    });

    await tx.recordShare.create({
      data: {
        appointment_id: appointment.id,
        patient_id: appointment.customer_id,
        doctor_id: appointment.doctor_id,
        ...share,
      },
    });

    return rel;
  });

  return relationship;
};

const ensureConsultation = async (appointment) => {
  const existing = await prisma.consultation.findUnique({
    where: { appointment_id: appointment.id },
  });
  if (existing) return existing;

  let relationship = await prisma.doctorPatientRelationship.findUnique({
    where: {
      doctor_id_patient_id: {
        doctor_id: appointment.doctor_id,
        patient_id: appointment.customer_id,
      },
    },
  });

  if (!relationship) {
    relationship = await prisma.doctorPatientRelationship.create({
      data: {
        doctor_id: appointment.doctor_id,
        patient_id: appointment.customer_id,
        status: 'active',
        first_consultation: appointment.appointment_date,
        last_consultation: appointment.appointment_date,
        total_consultations: 1,
      },
    });
  }

  if (!appointment.relationship_id) {
    await prisma.doctorAppointment.update({
      where: { id: appointment.id },
      data: { relationship_id: relationship.id },
    });
  }

  return prisma.consultation.create({
    data: {
      appointment_id: appointment.id,
      relationship_id: relationship.id,
      doctor_id: appointment.doctor_id,
      patient_id: appointment.customer_id,
      status: appointment.status === 'in_progress' ? 'in_progress' : 'scheduled',
      clinical_notes: appointment.consultation_notes || null,
    },
  });
};

const startConsultation = async (appointment) => {
  const consultation = await ensureConsultation(appointment);
  return prisma.consultation.update({
    where: { id: consultation.id },
    data: {
      status: 'in_progress',
      started_at: consultation.started_at || new Date(),
    },
  });
};

const completeConsultation = async (appointment, extras = {}) => {
  const consultation = await ensureConsultation(appointment);
  const data = {
    status: 'completed',
    completed_at: new Date(),
  };
  if (extras.symptoms !== undefined) data.symptoms = extras.symptoms;
  if (extras.diagnosis !== undefined) data.diagnosis = extras.diagnosis;
  if (extras.clinical_notes !== undefined) data.clinical_notes = extras.clinical_notes;
  if (extras.follow_up_date) data.follow_up_date = new Date(extras.follow_up_date);
  if (extras.follow_up_notes !== undefined) data.follow_up_notes = extras.follow_up_notes;

  const updated = await prisma.consultation.update({
    where: { id: consultation.id },
    data,
  });

  await prisma.doctorPatientRelationship.update({
    where: { id: consultation.relationship_id },
    data: { last_consultation: new Date() },
  });

  return updated;
};

const updateConsultation = async (doctorId, appointmentId, payload) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, doctor_id: doctorId },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);

  const consultation = await ensureConsultation(appointment);
  const data = {};
  if (payload.symptoms !== undefined) data.symptoms = payload.symptoms;
  if (payload.diagnosis !== undefined) data.diagnosis = payload.diagnosis;
  if (payload.clinical_notes !== undefined) data.clinical_notes = payload.clinical_notes;
  if (payload.follow_up_notes !== undefined) data.follow_up_notes = payload.follow_up_notes;
  if (payload.follow_up_date) data.follow_up_date = new Date(payload.follow_up_date);
  if (payload.follow_up_date === null) data.follow_up_date = null;

  if (payload.clinical_notes !== undefined) {
    await prisma.doctorAppointment.update({
      where: { id: appointmentId },
      data: { consultation_notes: payload.clinical_notes },
    });
  }

  return prisma.consultation.update({
    where: { id: consultation.id },
    data,
  });
};

const getConsultationByAppointment = async (doctorId, appointmentId) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: appointmentId, doctor_id: doctorId },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, profile_data: true } },
      prescription: true,
      consultation: true,
      record_share: true,
      lab_orders: {
        include: { lab_test: { select: { id: true, name: true, category: true } } },
        orderBy: { created_at: 'desc' },
      },
    },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);

  const consultation = appointment.consultation || (await ensureConsultation(appointment));
  const shared = await getSharedRecordsForDoctor(doctorId, appointment.customer_id);

  return {
    appointment,
    consultation,
    patient: sanitizePatient(appointment.customer),
    shared,
  };
};

const sanitizePatient = (user) => {
  const profile = user?.profile_data && typeof user.profile_data === 'object' ? user.profile_data : {};
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    bloodGroup: profile.bloodGroup || null,
    allergies: profile.allergies || [],
    currentMedicines: profile.currentMedicines || [],
  };
};

const getSharedRecordsForDoctor = async (doctorId, patientId) => {
  const shares = await prisma.recordShare.findMany({
    where: { doctor_id: doctorId, patient_id: patientId },
    orderBy: { created_at: 'desc' },
  });

  const flags = shares.reduce(
    (acc, share) => ({
      share_prescriptions: acc.share_prescriptions || share.share_prescriptions,
      share_lab_reports: acc.share_lab_reports || share.share_lab_reports,
      share_medicines: acc.share_medicines || share.share_medicines,
      share_documents: acc.share_documents || share.share_documents,
    }),
    { ...defaultShare, share_prescriptions: false, share_lab_reports: false, share_medicines: false, share_documents: false }
  );

  if (!shares.length) {
    Object.assign(flags, defaultShare);
  }

  const result = {
    flags,
    prescriptions: [],
    labReports: [],
    medicines: [],
    documents: [],
  };

  if (flags.share_prescriptions) {
    const [issued, uploaded] = await Promise.all([
      prisma.doctorPrescription.findMany({
        where: { customer_id: patientId, status: { not: 'draft' } },
        include: {
          doctor: { select: { id: true, name: true, specialty: true } },
          appointment: { select: { appointment_date: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      prisma.medicalDocument.findMany({
        where: { patient_id: patientId, document_type: 'prescription' },
        orderBy: { document_date: 'desc' },
        take: 20,
      }),
    ]);
    result.prescriptions = [
      ...issued.map((rx) => ({
        id: rx.id,
        source: 'doctor_issued',
        sourceLabel: 'Issued by Medzoos doctor',
        doctorName: rx.doctor?.name,
        date: rx.appointment?.appointment_date || rx.signed_at || rx.created_at,
        items: rx.items,
        notes: rx.notes,
        mine: rx.doctor_id === doctorId,
      })),
      ...uploaded.map((doc) => ({
        id: doc.id,
        source: 'patient_upload',
        sourceLabel: 'Uploaded by patient',
        doctorName: doc.doctor_name,
        date: doc.document_date || doc.created_at,
        title: doc.title,
        fileUrl: doc.file_url,
        notes: doc.notes,
        mine: false,
      })),
    ];
  }

  if (flags.share_lab_reports) {
    const [bookings, uploaded] = await Promise.all([
      prisma.labTestBooking.findMany({
        where: { customer_id: patientId, report_url: { not: null } },
        include: { lab_test: { select: { name: true } }, lab_partner: { select: { name: true } } },
        orderBy: { collection_date: 'desc' },
        take: 20,
      }),
      prisma.medicalDocument.findMany({
        where: { patient_id: patientId, document_type: 'lab_report' },
        orderBy: { document_date: 'desc' },
        take: 20,
      }),
    ]);
    result.labReports = [
      ...bookings.map((booking) => ({
        id: booking.id,
        source: 'lab',
        title: booking.lab_test?.name || 'Lab report',
        labName: booking.lab_partner?.name,
        date: booking.collection_date,
        fileUrl: booking.report_url,
        orderedByMe: booking.doctor_id === doctorId,
      })),
      ...uploaded.map((doc) => ({
        id: doc.id,
        source: 'patient_upload',
        sourceLabel: 'Uploaded by patient',
        title: doc.title,
        labName: doc.hospital_name,
        date: doc.document_date || doc.created_at,
        fileUrl: doc.file_url,
      })),
    ];
  }

  if (flags.share_medicines) {
    const prescriptions = await prisma.doctorPrescription.findMany({
      where: { customer_id: patientId, status: { in: ['signed', 'active'] } },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    result.medicines = prescriptions.flatMap((rx) =>
      (Array.isArray(rx.items) ? rx.items : []).map((item) => ({
        medicine: item.medicine || item.name,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
        source: rx.doctor_id === doctorId ? 'this_doctor' : 'other_doctor',
      }))
    );
  }

  if (flags.share_documents) {
    result.documents = await prisma.medicalDocument.findMany({
      where: {
        patient_id: patientId,
        document_type: { notIn: ['prescription', 'lab_report'] },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
  }

  return result;
};

const getPatientClinicalHistory = async (doctorId, patientId) => {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { id: true, name: true, email: true, phone: true, profile_data: true },
  });
  if (!patient) throw new AppError('Patient not found', 404);

  const relationship = await prisma.doctorPatientRelationship.findUnique({
    where: {
      doctor_id_patient_id: { doctor_id: doctorId, patient_id: patientId },
    },
  });

  const hasVisit = await prisma.doctorAppointment.findFirst({
    where: { doctor_id: doctorId, customer_id: patientId },
    select: { id: true },
  });
  if (!relationship && !hasVisit) {
    throw new AppError('No clinical relationship with this patient', 403);
  }

  const consultations = await prisma.consultation.findMany({
    where: { doctor_id: doctorId, patient_id: patientId },
    include: {
      appointment: {
        select: {
          id: true,
          appointment_date: true,
          slot: true,
          status: true,
          consultation_mode: true,
          preferred_consultation_mode: true,
          reason: true,
        },
      },
      prescriptions: true,
      lab_orders: {
        include: { lab_test: { select: { id: true, name: true } } },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const appointments = consultations.length
    ? []
    : await prisma.doctorAppointment.findMany({
        where: { doctor_id: doctorId, customer_id: patientId },
        include: { prescription: true },
        orderBy: { appointment_date: 'desc' },
      });

  const timeline = consultations.length
    ? consultations.map((item) => ({
        id: item.id,
        type: 'consultation',
        date: item.appointment?.appointment_date || item.created_at,
        status: item.status,
        mode: item.appointment?.consultation_mode || item.appointment?.preferred_consultation_mode,
        diagnosis: item.diagnosis,
        symptoms: item.symptoms,
        notes: item.clinical_notes,
        followUpDate: item.follow_up_date,
        followUpNotes: item.follow_up_notes,
        prescription: item.prescriptions[0] || null,
        labOrders: item.lab_orders,
        appointmentId: item.appointment_id,
      }))
    : appointments.map((item) => ({
        id: item.id,
        type: 'consultation',
        date: item.appointment_date,
        status: item.status,
        mode: item.consultation_mode || item.preferred_consultation_mode,
        diagnosis: null,
        symptoms: null,
        notes: item.consultation_notes,
        followUpDate: null,
        prescription: item.prescription,
        labOrders: [],
        appointmentId: item.id,
      }));

  const myPrescriptions = await prisma.doctorPrescription.findMany({
    where: { doctor_id: doctorId, customer_id: patientId },
    include: { appointment: { select: { appointment_date: true } } },
    orderBy: { created_at: 'desc' },
  });

  const myLabOrders = await prisma.labTestBooking.findMany({
    where: { doctor_id: doctorId, customer_id: patientId },
    include: { lab_test: { select: { id: true, name: true, category: true } } },
    orderBy: { created_at: 'desc' },
  });

  const shared = await getSharedRecordsForDoctor(doctorId, patientId);

  return {
    patient: sanitizePatient(patient),
    relationship: relationship || {
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      total_consultations: timeline.length,
      last_consultation: timeline[0]?.date || null,
    },
    timeline,
    myConsultations: timeline,
    myPrescriptions: myPrescriptions.map((rx) => ({
      ...rx,
      sourceLabel: 'Issued by Medzoos doctor',
    })),
    myDiagnoses: timeline.filter((item) => item.diagnosis).map((item) => ({
      id: item.id,
      diagnosis: item.diagnosis,
      date: item.date,
      appointmentId: item.appointmentId,
    })),
    myLabOrders,
    followUps: timeline.filter((item) => item.followUpDate),
    shared,
  };
};

const listDoctorPatients = async (doctorId) => {
  try {
    const relationships = await prisma.doctorPatientRelationship.findMany({
      where: { doctor_id: doctorId },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { last_consultation: 'desc' },
    });

    if (relationships.length) {
      return relationships.map((rel) => ({
        id: rel.patient.id,
        name: rel.patient.name,
        email: rel.patient.email,
        phone: rel.patient.phone,
        lastVisit: rel.last_consultation,
        condition: 'Clinical relationship',
        appointmentsCount: rel.total_consultations,
        relationshipId: rel.id,
        status: rel.status,
      }));
    }
  } catch (err) {
    console.error('listDoctorPatients relationships failed', err.message);
  }

  const appointments = await prisma.doctorAppointment.findMany({
    where: { doctor_id: doctorId },
    include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { appointment_date: 'desc' },
  });

  const map = new Map();
  for (const apt of appointments) {
    if (!map.has(apt.customer_id)) {
      map.set(apt.customer_id, {
        id: apt.customer.id,
        name: apt.customer.name,
        email: apt.customer.email,
        phone: apt.customer.phone,
        lastVisit: apt.appointment_date,
        condition: apt.reason || apt.status,
        appointmentsCount: 1,
      });
    } else {
      map.get(apt.customer_id).appointmentsCount += 1;
    }
  }
  return Array.from(map.values());
};

const savePrescription = async (doctorId, data) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: data.appointment_id, doctor_id: doctorId },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);
  if (!['in_progress', 'completed', 'confirmed'].includes(appointment.status)) {
    throw new AppError('Prescription can only be created during or after consultation', 400);
  }

  const consultation = await ensureConsultation(appointment);
  const status = data.sign === false ? 'draft' : 'signed';
  const payload = {
    items: data.items,
    notes: data.notes || null,
    status,
    source: 'doctor_issued',
    signed_at: status === 'signed' ? new Date() : null,
    consultation_id: consultation.id,
  };

  const existing = await prisma.doctorPrescription.findUnique({
    where: { appointment_id: appointment.id },
  });

  if (existing) {
    return prisma.doctorPrescription.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.doctorPrescription.create({
    data: {
      appointment_id: appointment.id,
      doctor_id: doctorId,
      customer_id: appointment.customer_id,
      ...payload,
    },
  });
};

const orderLabTest = async (doctorId, data) => {
  const appointment = await prisma.doctorAppointment.findFirst({
    where: { id: data.appointment_id, doctor_id: doctorId },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!appointment) throw new AppError('Appointment not found', 404);

  const test = await prisma.labTest.findFirst({
    where: { id: data.lab_test_id, is_active: true },
  });
  if (!test) throw new AppError('Lab test not found', 404);

  const consultation = await ensureConsultation(appointment);

  return prisma.labTestBooking.create({
    data: {
      lab_test_id: test.id,
      lab_partner_id: test.lab_partner_id,
      customer_id: appointment.customer_id,
      doctor_id: doctorId,
      appointment_id: appointment.id,
      consultation_id: consultation.id,
      ordered_by_doctor: true,
      patient_name: appointment.customer?.name,
      collection_type: data.collection_type || 'HOME',
      time_slot: data.time_slot || 'To be scheduled',
      collection_date: data.collection_date ? new Date(data.collection_date) : new Date(),
      price: test.price,
      status: 'pending',
      payment_status: 'pending',
      notes: data.notes || `Ordered by doctor during consultation`,
    },
    include: { lab_test: { select: { id: true, name: true, category: true, price: true } } },
  });
};

const listMedicalDocuments = async (patientId, query = {}) => {
  const where = { patient_id: patientId };
  if (query.document_type) where.document_type = query.document_type;
  return prisma.medicalDocument.findMany({
    where,
    orderBy: [{ document_date: 'desc' }, { created_at: 'desc' }],
  });
};

const createMedicalDocument = async (patientId, data) => {
  const documentType = DOCUMENT_TYPES.includes(data.document_type)
    ? data.document_type
    : 'other';
  if (!data.file_url) throw new AppError('Please upload a file', 400);

  return prisma.medicalDocument.create({
    data: {
      patient_id: patientId,
      document_type: documentType,
      source: 'patient_upload',
      title: data.title || documentType.replace(/_/g, ' '),
      doctor_name: data.doctor_name || null,
      hospital_name: data.hospital_name || null,
      document_date: data.document_date ? new Date(data.document_date) : new Date(),
      file_url: data.file_url,
      notes: data.notes || null,
    },
  });
};

const deleteMedicalDocument = async (patientId, documentId) => {
  const document = await prisma.medicalDocument.findFirst({
    where: { id: documentId, patient_id: patientId },
  });
  if (!document) throw new AppError('Document not found', 404);
  await prisma.medicalDocument.delete({ where: { id: document.id } });
  return { deleted: true };
};

const getHealthTimeline = async (patientId) => {
  const [appointments, documents, labBookings, prescriptions] = await Promise.all([
    prisma.doctorAppointment.findMany({
      where: { customer_id: patientId },
      include: {
        doctor: { select: { name: true, specialty: true } },
        consultation: true,
        prescription: true,
      },
      orderBy: { appointment_date: 'desc' },
      take: 50,
    }),
    prisma.medicalDocument.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    prisma.labTestBooking.findMany({
      where: { customer_id: patientId },
      include: { lab_test: { select: { name: true } }, lab_partner: { select: { name: true } } },
      orderBy: { collection_date: 'desc' },
      take: 50,
    }),
    prisma.doctorPrescription.findMany({
      where: { customer_id: patientId },
      include: { doctor: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
  ]);

  const events = [];

  appointments.forEach((item) => {
    events.push({
      id: `consult-${item.id}`,
      type: 'consultation',
      title: `Consultation with ${item.doctor?.name || 'Doctor'}`,
      subtitle: item.consultation?.diagnosis || item.doctor?.specialty || item.reason,
      date: item.appointment_date,
      source: 'doctor',
      sourceLabel: 'Issued by Medzoos doctor',
      meta: {
        appointmentId: item.id,
        mode: item.consultation_mode || item.preferred_consultation_mode,
        status: item.status,
      },
    });
  });

  prescriptions.forEach((item) => {
    events.push({
      id: `rx-${item.id}`,
      type: 'prescription',
      title: 'Prescription',
      subtitle: item.doctor?.name || 'Medzoos doctor',
      date: item.signed_at || item.created_at,
      source: 'doctor_issued',
      sourceLabel: 'Issued by Medzoos doctor',
      meta: { prescriptionId: item.id, items: item.items },
    });
  });

  labBookings.forEach((item) => {
    events.push({
      id: `lab-${item.id}`,
      type: item.report_url ? 'lab_report' : 'lab_test',
      title: item.report_url
        ? `${item.lab_test?.name || 'Lab'} report ready`
        : item.lab_test?.name || 'Lab test',
      subtitle: item.lab_partner?.name || (item.ordered_by_doctor ? 'Ordered by doctor' : 'Booked by you'),
      date: item.collection_date,
      source: 'lab',
      sourceLabel: item.ordered_by_doctor ? 'Ordered by Medzoos doctor' : 'Booked by patient',
      meta: { bookingId: item.id, reportUrl: item.report_url, status: item.status },
    });
  });

  documents.forEach((item) => {
    events.push({
      id: `doc-${item.id}`,
      type: item.document_type,
      title: item.title,
      subtitle: item.doctor_name || item.hospital_name || 'Uploaded by patient',
      date: item.document_date || item.created_at,
      source: 'patient_upload',
      sourceLabel: 'Uploaded by patient',
      meta: { documentId: item.id, fileUrl: item.file_url },
    });
  });

  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
};

module.exports = {
  DOCUMENT_TYPES,
  onAppointmentCreated,
  ensureConsultation,
  startConsultation,
  completeConsultation,
  updateConsultation,
  getConsultationByAppointment,
  getPatientClinicalHistory,
  listDoctorPatients,
  savePrescription,
  orderLabTest,
  listMedicalDocuments,
  createMedicalDocument,
  deleteMedicalDocument,
  getHealthTimeline,
  getSharedRecordsForDoctor,
};
