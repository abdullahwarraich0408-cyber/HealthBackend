const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const {
  buildDashboard,
  buildCalendarEvents,
  buildWeeklySummary,
  answerCopilotQuestion,
  computeHealthScore,
} = require('./family-vault.ai');
const { extractPrescriptionFromFile } = require('../../services/prescription-ocr/prescription-ocr.service');

const MEMBER_INCLUDE = {
  timeline: { orderBy: { event_date: 'desc' } },
  medicines: { orderBy: { created_at: 'desc' } },
  lab_reports: { orderBy: { report_date: 'desc' } },
  vaccinations: { orderBy: { vaccinated_at: 'desc' } },
  vitals: { orderBy: { recorded_at: 'desc' } },
  doctors: { orderBy: { created_at: 'desc' } },
  appointments: { orderBy: { appointment_date: 'desc' } },
  prescriptions: { orderBy: { uploaded_at: 'desc' } },
};

function parseDate(value) {
  if (!value) return null;
  return new Date(value);
}

async function getVaultForUser(userId) {
  return prisma.familyHealthVault.findFirst({
    where: { admin_user_id: userId },
    include: {
      members: {
        include: MEMBER_INCLUDE,
        orderBy: { created_at: 'asc' },
      },
    },
  });
}

async function ensureVault(userId) {
  const vault = await getVaultForUser(userId);
  if (!vault) throw new AppError('Family health vault not found. Create a family first.', 404);
  return vault;
}

async function ensureMember(vaultId, memberId) {
  const member = await prisma.vaultFamilyMember.findFirst({
    where: { id: memberId, vault_id: vaultId },
    include: MEMBER_INCLUDE,
  });
  if (!member) throw new AppError('Family member not found', 404);
  return member;
}

function mapMember(member) {
  return {
    ...member,
    health_score: computeHealthScore(member),
  };
}

async function createFamily(userId, data) {
  const existing = await prisma.familyHealthVault.findFirst({
    where: { admin_user_id: userId },
  });
  if (existing) throw new AppError('Family already exists for this account', 400);

  return prisma.familyHealthVault.create({
    data: {
      admin_user_id: userId,
      name: data.name || null,
      home_address: data.home_address || null,
      emergency_contact: data.emergency_contact || null,
      preferred_hospital: data.preferred_hospital || null,
      preferred_pharmacy: data.preferred_pharmacy || null,
      preferred_lab: data.preferred_lab || null,
      notification_prefs: {
        medicine_refills: true,
        lab_reports: true,
        vaccinations: true,
        missed_medicine: true,
        appointments: true,
        ai_insights: true,
      },
    },
    include: { members: true },
  });
}

async function getFamily(userId) {
  const vault = await getVaultForUser(userId);
  if (!vault) return null;
  return {
    ...vault,
    members: vault.members.map(mapMember),
    dashboard: buildDashboard(vault.members),
    family_health_score: vault.members.length
      ? Math.round(
          vault.members.reduce((s, m) => s + computeHealthScore(m), 0) / vault.members.length,
        )
      : null,
  };
}

async function updateFamily(userId, data) {
  const vault = await ensureVault(userId);
  return prisma.familyHealthVault.update({
    where: { id: vault.id },
    data: {
      name: data.name,
      home_address: data.home_address,
      emergency_contact: data.emergency_contact,
      preferred_hospital: data.preferred_hospital,
      preferred_pharmacy: data.preferred_pharmacy,
      preferred_lab: data.preferred_lab,
      notification_prefs: data.notification_prefs,
    },
    include: { members: true },
  });
}

async function addMember(userId, data) {
  const vault = await ensureVault(userId);
  const member = await prisma.vaultFamilyMember.create({
    data: {
      vault_id: vault.id,
      full_name: data.full_name,
      relationship: data.relationship,
      gender: data.gender || null,
      date_of_birth: parseDate(data.date_of_birth),
      blood_group: data.blood_group || null,
      height_cm: data.height_cm ?? null,
      weight_kg: data.weight_kg ?? null,
      phone: data.phone || null,
      email: data.email || null,
      access_role: data.access_role || 'member',
      can_view: data.can_view ?? true,
      can_edit: data.can_edit ?? false,
      medical_profile: data.medical_profile || {},
      emergency_profile: data.emergency_profile || {
        bloodGroup: data.blood_group,
        emergencyContact: vault.emergency_contact,
      },
    },
    include: MEMBER_INCLUDE,
  });

  await prisma.vaultTimelineEvent.create({
    data: {
      member_id: member.id,
      event_type: 'profile_created',
      title: 'Profile created',
      description: `${member.full_name} added to family health vault`,
      event_date: new Date(),
    },
  });

  return mapMember(member);
}

async function updateMember(userId, memberId, data) {
  const vault = await ensureVault(userId);
  await ensureMember(vault.id, memberId);

  const member = await prisma.vaultFamilyMember.update({
    where: { id: memberId },
    data: {
      full_name: data.full_name,
      relationship: data.relationship,
      gender: data.gender,
      date_of_birth: data.date_of_birth !== undefined ? parseDate(data.date_of_birth) : undefined,
      blood_group: data.blood_group,
      height_cm: data.height_cm,
      weight_kg: data.weight_kg,
      phone: data.phone,
      email: data.email,
      access_role: data.access_role,
      can_view: data.can_view,
      can_edit: data.can_edit,
      medical_profile: data.medical_profile,
      emergency_profile: data.emergency_profile,
    },
    include: MEMBER_INCLUDE,
  });

  return mapMember(member);
}

async function deleteMember(userId, memberId) {
  const vault = await ensureVault(userId);
  await ensureMember(vault.id, memberId);
  await prisma.vaultFamilyMember.delete({ where: { id: memberId } });
  return { deleted: true };
}

async function getMember(userId, memberId) {
  const vault = await ensureVault(userId);
  const member = await ensureMember(vault.id, memberId);
  return mapMember(member);
}

async function addTimelineEvent(userId, memberId, data) {
  const vault = await ensureVault(userId);
  await ensureMember(vault.id, memberId);

  return prisma.vaultTimelineEvent.create({
    data: {
      member_id: memberId,
      event_type: data.event_type,
      title: data.title,
      description: data.description || null,
      event_date: parseDate(data.event_date) || new Date(),
      metadata: data.metadata || null,
      file_url: data.file_url || null,
    },
  });
}

async function createResource(userId, memberId, model, data, extra = {}) {
  const vault = await ensureVault(userId);
  await ensureMember(vault.id, memberId);

  const record = await prisma[model].create({
    data: {
      member_id: memberId,
      ...data,
      ...extra,
    },
  });

  const eventTypeMap = {
    vaultMedicine: 'medicine_added',
    vaultLabReport: 'lab_report',
    vaultVaccination: 'vaccination',
    vaultVital: data.vital_type || 'vital',
    vaultDoctor: 'doctor_added',
    vaultAppointment: 'doctor_consultation',
    vaultPrescription: 'prescription',
  };

  await prisma.vaultTimelineEvent.create({
    data: {
      member_id: memberId,
      event_type: eventTypeMap[model] || 'other',
      title: data.title || data.name || data.vaccine_name || data.doctor_name || 'Health record',
      event_date: parseDate(data.report_date || data.vaccinated_at || data.recorded_at || data.appointment_date) || new Date(),
      file_url: data.file_url || data.prescription_url || null,
      metadata: { resource_id: record.id, model },
    },
  });

  return record;
}

async function addMedicine(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultMedicine', {
    name: data.name,
    dose: data.dose,
    morning: data.morning ?? false,
    afternoon: data.afternoon ?? false,
    night: data.night ?? false,
    start_date: parseDate(data.start_date),
    end_date: parseDate(data.end_date),
    refills_remaining: data.refills_remaining,
    prescribing_doctor: data.prescribing_doctor,
    pharmacy: data.pharmacy,
    instructions: data.instructions,
    purpose: data.purpose,
    adherence_log: data.adherence_log || {},
  });
}

async function addLabReport(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultLabReport', {
    category: data.category,
    title: data.title,
    report_date: parseDate(data.report_date),
    file_url: data.file_url,
    lab_name: data.lab_name,
    ai_summary: data.ai_summary,
    extracted_values: data.extracted_values,
  });
}

async function addVaccination(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultVaccination', {
    vaccine_name: data.vaccine_name,
    dose: data.dose,
    vaccinated_at: parseDate(data.vaccinated_at),
    hospital: data.hospital,
    next_due: parseDate(data.next_due),
  });
}

async function addVital(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultVital', {
    vital_type: data.vital_type,
    value: data.value,
    unit: data.unit,
    recorded_at: parseDate(data.recorded_at),
    notes: data.notes,
  });
}

async function addDoctor(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultDoctor', {
    name: data.name,
    specialty: data.specialty,
    clinic: data.clinic,
    hospital: data.hospital,
    phone: data.phone,
    is_primary: data.is_primary ?? false,
    last_visit: parseDate(data.last_visit),
    next_appointment: parseDate(data.next_appointment),
    notes: data.notes,
  });
}

async function addAppointment(userId, memberId, data) {
  return createResource(userId, memberId, 'vaultAppointment', {
    doctor_name: data.doctor_name,
    specialty: data.specialty,
    reason: data.reason,
    diagnosis: data.diagnosis,
    prescription_url: data.prescription_url,
    follow_up_date: parseDate(data.follow_up_date),
    payment: data.payment,
    documents: data.documents,
    appointment_date: parseDate(data.appointment_date),
  });
}

async function addPrescription(userId, memberId, data) {
  const ocrData =
    data.ocr_data || (await extractPrescriptionFromFile(data.file_url));
  const record = await createResource(userId, memberId, 'vaultPrescription', {
    file_url: data.file_url,
    file_type: data.file_type,
    ocr_data: ocrData,
  });

  if (ocrData?.medicines?.length) {
    for (const med of ocrData.medicines) {
      await addMedicine(userId, memberId, {
        name: med.name,
        dose: med.dose,
        morning: med.frequency?.includes('morning'),
        afternoon: med.frequency?.includes('afternoon'),
        night: med.frequency?.includes('night'),
        instructions: med.instructions,
        purpose: med.purpose,
        prescribing_doctor: ocrData.doctor,
      });
    }
  }

  return record;
}

async function deletePrescription(userId, memberId, prescriptionId) {
  const vault = await ensureVault(userId);
  await ensureMember(vault.id, memberId);

  const prescription = await prisma.vaultPrescription.findFirst({
    where: { id: prescriptionId, member_id: memberId },
  });
  if (!prescription) throw new AppError('Prescription not found', 404);

  await prisma.vaultPrescription.delete({ where: { id: prescriptionId } });
  return { deleted: true, id: prescriptionId };
}

async function getDashboard(userId) {
  const vault = await ensureVault(userId);
  return {
    family_name: vault.name,
    members: buildDashboard(vault.members),
    overall_score: vault.members.length
      ? Math.round(
          vault.members.reduce((s, m) => s + computeHealthScore(m), 0) / vault.members.length,
        )
      : null,
  };
}

async function getCalendar(userId, { from, to } = {}) {
  const vault = await ensureVault(userId);
  let events = buildCalendarEvents(vault.members);
  if (from) events = events.filter((e) => new Date(e.date) >= new Date(from));
  if (to) events = events.filter((e) => new Date(e.date) <= new Date(to));
  return { events };
}

async function getAiInsights(userId) {
  const vault = await ensureVault(userId);
  const insights = [];
  for (const member of vault.members) {
    const dashboard = buildDashboard([member])[0];
    insights.push({
      member_id: member.id,
      member_name: member.full_name,
      health_score: dashboard.health_score,
      alerts: dashboard.alerts,
      insights: dashboard.insights,
    });
  }
  return {
    generated_at: new Date().toISOString(),
    members: insights,
    disclaimer: 'These reminders and insights are informational, not medical diagnoses.',
  };
}

async function getWeeklySummary(userId) {
  const vault = await ensureVault(userId);
  return buildWeeklySummary(vault.members);
}

async function copilotQuery(userId, question) {
  const vault = await ensureVault(userId);
  return {
    ...answerCopilotQuestion(question, vault.members),
    disclaimer: 'AI responses are based on stored records and are not medical advice.',
  };
}

async function searchTimeline(userId, query) {
  const vault = await ensureVault(userId);
  const memberIds = vault.members.map((m) => m.id);
  const q = query.toLowerCase();

  const events = await prisma.vaultTimelineEvent.findMany({
    where: {
      member_id: { in: memberIds },
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { event_type: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { event_date: 'desc' },
    take: 50,
    include: { member: { select: { id: true, full_name: true, relationship: true } } },
  });

  return {
    results: events.filter(
      (e) =>
        e.title.toLowerCase().includes(q)
        || (e.description || '').toLowerCase().includes(q)
        || e.event_type.toLowerCase().includes(q),
    ),
  };
}

async function getEmergencyProfile(userId, memberId) {
  const vault = await ensureVault(userId);
  const member = await ensureMember(vault.id, memberId);
  const emergency = member.emergency_profile || {};
  const qrPayload = JSON.stringify({
    name: member.full_name,
    bloodGroup: emergency.bloodGroup || member.blood_group,
    allergies: emergency.allergies || [],
    conditions: emergency.conditions || member.medical_profile?.conditions?.map((c) => c.name) || [],
    medicines: (member.medicines || []).map((m) => m.name),
    emergencyContact: emergency.emergencyContact || vault.emergency_contact,
    insurance: emergency.insurance,
    primaryDoctor: emergency.primaryDoctor || member.doctors?.find((d) => d.is_primary)?.name,
  });

  return {
    member: {
      id: member.id,
      full_name: member.full_name,
      blood_group: member.blood_group,
    },
    emergency_profile: emergency,
    current_medicines: member.medicines,
    conditions: member.medical_profile?.conditions || [],
    qr_data: qrPayload,
  };
}

module.exports = {
  createFamily,
  getFamily,
  updateFamily,
  addMember,
  updateMember,
  deleteMember,
  getMember,
  addTimelineEvent,
  addMedicine,
  addLabReport,
  addVaccination,
  addVital,
  addDoctor,
  addAppointment,
  addPrescription,
  deletePrescription,
  getDashboard,
  getCalendar,
  getAiInsights,
  getWeeklySummary,
  copilotQuery,
  searchTimeline,
  getEmergencyProfile,
};
