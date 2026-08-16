const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const email = 'doctor@medzoos.com';
  const password = await bcrypt.hash('password123', 10);

  const account = await prisma.account.upsert({
    where: { email },
    update: { password, role: 'doctor', is_active: true },
    create: { email, password, role: 'doctor', is_active: true },
  });

  let doctor = await prisma.doctor.findFirst({
    where: { OR: [{ email }, { account_id: account.id }] },
  });

  const doctorData = {
    name: 'Dr. Ayesha Khan',
    email,
    password,
    specialty: 'General Physician',
    experience_years: 12,
    rating: 4.9,
    reviews_count: 324,
    fee: 1500,
    about:
      'MBBS, FCPS. Specializes in general medicine with focus on preventive care and chronic disease management.',
    is_active: true,
    online: true,
    available_today: true,
    languages: ['English', 'Urdu'],
    qualifications: ['MBBS — Aga Khan University', 'FCPS — College of Physicians'],
    hospital: 'Aga Khan University Hospital',
    photo_url:
      'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
    slots: [
      { day: 'Monday', slots: ['09:00 AM - 01:00 PM', '04:00 PM - 07:00 PM'] },
      { day: 'Tuesday', slots: ['09:00 AM - 01:00 PM'] },
      { day: 'Wednesday', slots: ['09:00 AM - 01:00 PM', '04:00 PM - 07:00 PM'] },
      { day: 'Thursday', slots: ['09:00 AM - 01:00 PM'] },
      { day: 'Friday', slots: ['09:00 AM - 01:00 PM'] },
    ],
    account_id: account.id,
  };

  if (!doctor) {
    doctor = await prisma.doctor.create({ data: doctorData });
  } else {
    doctor = await prisma.doctor.update({
      where: { id: doctor.id },
      data: doctorData,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        password: 'password123',
        accountId: account.id,
        doctorId: doctor.id,
        hasProfile: Boolean(doctor),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
