const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 'Monday', slots: ['09:00 AM - 01:00 PM'] },
  { day: 'Tuesday', slots: ['09:00 AM - 01:00 PM'] },
  { day: 'Wednesday', slots: ['09:00 AM - 01:00 PM'] },
  { day: 'Thursday', slots: ['09:00 AM - 01:00 PM'] },
  { day: 'Friday', slots: ['09:00 AM - 01:00 PM'] },
  { day: 'Saturday', slots: [] },
  { day: 'Sunday', slots: [] },
];

const parseInteger = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseMoney = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapCreateDoctorError = (error) => {
  if (error.code === 'P2002') {
    return new AppError('Email already in use', 400);
  }
  if (error.code === 'P2021' || /does not exist/i.test(error.message || '')) {
    return new AppError(
      'Doctor tables are missing on the server database. Run `npx prisma db push` on production and redeploy.',
      503
    );
  }
  if (error.code === 'P2003') {
    return new AppError('Doctor profile could not be linked to the account', 400);
  }
  return error;
};

const createDoctor = async (payload, adminUserId = null) => {
  const { name, email, password, specialty, experience_years, fee, hospital_id } = payload;

  if (!name?.trim() || !email?.trim() || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();

  const [existingAccount, legacyDoctor] = await Promise.all([
    prisma.account.findUnique({ where: { email: normalizedEmail } }),
    prisma.doctor.findUnique({ where: { email: normalizedEmail } }),
  ]);

  if (existingAccount || legacyDoctor) {
    throw new AppError('Email already in use', 400);
  }

  let hospitalName = 'Independent Practice';
  let linkedHospitalId = null;

  if (hospital_id) {
    const hospital = await prisma.hospital.findUnique({ where: { id: hospital_id } });
    if (!hospital) throw new AppError('Hospital not found', 400);
    hospitalName = hospital.name;
    linkedHospitalId = hospital.id;
  }

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);

  let account;
  let doctor;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdAccount = await tx.account.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role: 'doctor',
        },
      });

      const createdDoctor = await tx.doctor.create({
        data: {
          account_id: createdAccount.id,
          name: normalizedName,
          email: normalizedEmail,
          specialty: specialty?.trim() || 'General Physician',
          experience_years: parseInteger(experience_years, 0),
          fee: parseMoney(fee, 0),
          is_active: true,
          hospital_id: linkedHospitalId,
          hospital: hospitalName,
          languages: [],
          qualifications: [],
          slots: DEFAULT_WEEKLY_SCHEDULE,
        },
      });

      if (linkedHospitalId) {
        await tx.doctorPracticeLocation.create({
          data: {
            doctor_id: createdDoctor.id,
            hospital_id: linkedHospitalId,
            fee: parseMoney(fee, 0),
            schedule: DEFAULT_WEEKLY_SCHEDULE,
          },
        });
      }

      return { account: createdAccount, doctor: createdDoctor };
    });

    account = result.account;
    doctor = result.doctor;
  } catch (error) {
    throw mapCreateDoctorError(error);
  }

  try {
    await prisma.auditLog.create({
      data: {
        action: 'DOCTOR_CREATED',
        entity: 'doctor',
        entity_id: doctor.id,
        user_id: adminUserId || null,
      },
    });
  } catch {
    // Audit logging should not block doctor creation.
  }

  return {
    ...doctor,
    email: account.email,
  };
};

module.exports = {
  createDoctor,
  DEFAULT_WEEKLY_SCHEDULE,
};
