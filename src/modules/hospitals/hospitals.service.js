const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { slugify } = require('../../utils/slugify');

const hospitalSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  cover_image: true,
  description: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  is_active: true,
  created_at: true,
};

const doctorPublicSelect = {
  id: true,
  name: true,
  specialty: true,
  experience_years: true,
  rating: true,
  reviews_count: true,
  fee: true,
  online: true,
  available_today: true,
  languages: true,
  photo_url: true,
  slots: true,
  about: true,
  qualifications: true,
  hospital: true,
  hospital_id: true,
  hospital_ref: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      logo: true,
    },
  },
};

const resolveHospital = async (idOrSlug) => {
  const hospital = await prisma.hospital.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      is_active: true,
    },
    select: {
      ...hospitalSelect,
      _count: { select: { doctors: { where: { is_active: true } } } },
    },
  });

  if (!hospital) throw new AppError('Hospital not found', 404);
  return hospital;
};

const getHospitals = async (query = {}) => {
  const where = { is_active: true };
  if (query.city) where.city = query.city;

  const hospitals = await prisma.hospital.findMany({
    where,
    select: {
      ...hospitalSelect,
      _count: { select: { doctors: { where: { is_active: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  if (query.q) {
    const q = String(query.q).toLowerCase();
    return hospitals.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.city || '').toLowerCase().includes(q)
    );
  }

  return hospitals;
};

const getHospitalById = async (idOrSlug) => resolveHospital(idOrSlug);

const getHospitalDoctors = async (idOrSlug, query = {}) => {
  const hospital = await resolveHospital(idOrSlug);

  const linkedLocations = await prisma.doctorPracticeLocation.findMany({
    where: { hospital_id: hospital.id, is_active: true },
    select: { doctor_id: true },
  });
  const linkedDoctorIds = [...new Set(linkedLocations.map((item) => item.doctor_id))];

  const where = {
    is_active: true,
    OR: [
      { hospital_id: hospital.id },
      ...(linkedDoctorIds.length ? [{ id: { in: linkedDoctorIds } }] : []),
    ],
  };

  if (query.specialty) {
    where.specialty = query.specialty;
  }

  const doctors = await prisma.doctor.findMany({
    where,
    select: {
      ...doctorPublicSelect,
      practice_locations: {
        where: { is_active: true, hospital_id: hospital.id },
        include: {
          hospital: {
            select: { id: true, name: true, slug: true, city: true, logo: true, address: true },
          },
        },
      },
    },
    orderBy: [{ rating: 'desc' }, { name: 'asc' }],
  });

  const specialties = [...new Set(doctors.map((doctor) => doctor.specialty))].sort();

  return {
    hospital,
    doctors,
    specialties,
  };
};

const getHospitalSpecialties = async (idOrSlug) => {
  const hospital = await resolveHospital(idOrSlug);
  const linkedLocations = await prisma.doctorPracticeLocation.findMany({
    where: { hospital_id: hospital.id, is_active: true },
    select: { doctor_id: true },
  });
  const linkedDoctorIds = [...new Set(linkedLocations.map((item) => item.doctor_id))];

  const doctors = await prisma.doctor.findMany({
    where: {
      is_active: true,
      OR: [
        { hospital_id: hospital.id },
        ...(linkedDoctorIds.length ? [{ id: { in: linkedDoctorIds } }] : []),
      ],
    },
    select: { specialty: true },
  });
  return [...new Set(doctors.map((item) => item.specialty))].sort();
};

const buildUniqueSlug = async (name, excludeId = null) => {
  const base = slugify(name) || 'hospital';
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.hospital.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    counter += 1;
    candidate = `${base}-${counter}`;
  }
};

const createHospital = async (payload, adminUserId = null) => {
  if (!payload.name?.trim()) throw new AppError('Hospital name is required', 400);

  const slug = await buildUniqueSlug(payload.name);

  const hospital = await prisma.hospital.create({
    data: {
      name: payload.name.trim(),
      slug,
      logo: payload.logo || null,
      cover_image: payload.cover_image || null,
      description: payload.description || null,
      address: payload.address || null,
      city: payload.city || null,
      phone: payload.phone || null,
      email: payload.email?.trim().toLowerCase() || null,
      is_active: payload.is_active !== false,
      created_by: adminUserId,
    },
    select: hospitalSelect,
  });

  return hospital;
};

const updateHospital = async (id, payload) => {
  const existing = await prisma.hospital.findUnique({ where: { id } });
  if (!existing) throw new AppError('Hospital not found', 404);

  const data = {};
  if (payload.name !== undefined) {
    data.name = payload.name.trim();
    data.slug = await buildUniqueSlug(payload.name, id);
  }
  if (payload.logo !== undefined) data.logo = payload.logo;
  if (payload.cover_image !== undefined) data.cover_image = payload.cover_image;
  if (payload.description !== undefined) data.description = payload.description;
  if (payload.address !== undefined) data.address = payload.address;
  if (payload.city !== undefined) data.city = payload.city;
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.email !== undefined) data.email = payload.email?.trim().toLowerCase() || null;
  if (payload.is_active !== undefined) data.is_active = Boolean(payload.is_active);

  return prisma.hospital.update({
    where: { id },
    data,
    select: hospitalSelect,
  });
};

const setHospitalStatus = async (id, isActive, adminUserId = null) => {
  const hospital = await prisma.hospital.update({
    where: { id },
    data: { is_active: Boolean(isActive) },
    select: hospitalSelect,
  });

  try {
    await prisma.auditLog.create({
      data: {
        action: isActive ? 'HOSPITAL_ACTIVATED' : 'HOSPITAL_DEACTIVATED',
        entity: 'hospital',
        entity_id: id,
        user_id: adminUserId || null,
      },
    });
  } catch {
    // ignore audit failures
  }

  return hospital;
};

const deleteHospital = async (id, adminUserId = null) => {
  const hospital = await prisma.hospital.findUnique({
    where: { id },
    include: { _count: { select: { doctors: true } } },
  });
  if (!hospital) throw new AppError('Hospital not found', 404);
  if (hospital._count.doctors > 0) {
    throw new AppError('Cannot delete hospital with assigned doctors. Deactivate it instead.', 400);
  }

  await prisma.hospital.delete({ where: { id } });

  try {
    await prisma.auditLog.create({
      data: {
        action: 'HOSPITAL_DELETED',
        entity: 'hospital',
        entity_id: id,
        user_id: adminUserId || null,
      },
    });
  } catch {
    // ignore audit failures
  }

  return { id };
};

const listAdminHospitals = async () =>
  prisma.hospital.findMany({
    select: {
      ...hospitalSelect,
      _count: { select: { doctors: true } },
    },
    orderBy: { created_at: 'desc' },
  });

module.exports = {
  getHospitals,
  getHospitalById,
  getHospitalDoctors,
  getHospitalSpecialties,
  createHospital,
  updateHospital,
  setHospitalStatus,
  deleteHospital,
  listAdminHospitals,
};
