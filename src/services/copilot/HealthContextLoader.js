const prisma = require('../../config/database');

function calcAge(dob) {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

async function loadHealthContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      gender: true,
      date_of_birth: true,
      profile_data: true,
      family_profiles: {
        select: { full_name: true, relationship: true, blood_group: true },
      },
      family_health_vaults: {
        include: {
          members: {
            select: {
              id: true,
              full_name: true,
              relationship: true,
              blood_group: true,
              health_score: true,
              medical_profile: true,
              medicines: { select: { name: true, end_date: true } },
              vaccinations: { select: { vaccine_name: true, next_due: true } },
            },
          },
        },
      },
      doctor_appointments: {
        where: { status: { in: ['pending', 'confirmed'] } },
        orderBy: { appointment_date: 'asc' },
        take: 3,
        select: {
          appointment_date: true,
          slot: true,
          doctor: { select: { name: true, specialty: true } },
        },
      },
      lab_test_bookings: {
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          status: true,
          collection_date: true,
          lab_test: { select: { name: true } },
        },
      },
      orders: {
        orderBy: { created_at: 'desc' },
        take: 10,
        select: { id: true, status: true, created_at: true },
      },
    },
  });

  if (!user) return null;

  const profileData = user.profile_data || {};
  const firstName = (user.name || 'there').split(' ')[0];
  const medicalRecords = profileData.medicalRecords || profileData.medical_records || [];

  const insights = [];
  const upcoming = user.doctor_appointments?.[0];
  if (upcoming?.doctor?.name) {
    const dateStr = upcoming.appointment_date
      ? new Date(upcoming.appointment_date).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'soon';
    insights.push(`You have a follow-up with ${upcoming.doctor.name} on ${dateStr}.`);
  }

  const labReports = (user.lab_test_bookings || [])
    .filter((b) => b.status === 'completed' || b.status === 'report_ready')
    .map((b) => ({
      name: b.lab_test?.name || 'Lab test',
      date: b.collection_date,
    }));

  const familyVault = user.family_health_vaults?.[0] || null;
  const vaultMembers = familyVault?.members || [];

  return {
    personal: {
      name: user.name,
      firstName,
      age: calcAge(user.date_of_birth),
      gender: user.gender,
      bloodGroup: profileData.bloodGroup || profileData.blood_group,
    },
    conditions: extractConditions(medicalRecords),
    allergies: profileData.allergies || { medicine: [], food: [], environmental: [] },
    currentMedicines: [],
    consultations: medicalRecords
      .filter((r) => String(r.type || '').toLowerCase().includes('consult'))
      .slice(0, 5),
    labReports,
    familyHistory: (user.family_profiles || []).map((f) => f.relationship).filter(Boolean),
    familyVault: familyVault
      ? {
          id: familyVault.id,
          name: familyVault.name,
          memberCount: vaultMembers.length,
          members: vaultMembers.map((m) => ({
            id: m.id,
            name: m.full_name,
            relationship: m.relationship,
            healthScore: m.health_score,
            conditions: m.medical_profile?.conditions?.map((c) => c.name) || [],
          })),
        }
      : null,
    lifestyle: profileData.lifestyle || { smoking: false },
    upcomingAppointments: (user.doctor_appointments || []).map((a) => ({
      doctor: a.doctor?.name,
      specialty: a.doctor?.specialty,
      date: a.appointment_date,
    })),
    insights,
    orders: user.orders || [],
  };
}

function extractConditions(records) {
  const keywords = ['diabetes', 'hypertension', 'asthma', 'heart', 'kidney', 'liver'];
  const found = new Set();
  (records || []).forEach((r) => {
    const text = `${r.type || ''} ${r.title || ''}`.toLowerCase();
    keywords.forEach((k) => {
      if (text.includes(k)) found.add(k.charAt(0).toUpperCase() + k.slice(1));
    });
  });
  return Array.from(found);
}

module.exports = { loadHealthContext, calcAge };
