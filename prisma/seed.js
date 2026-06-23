const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const HOSPITALS = [
  {
    name: 'Cheema Heart Complex',
    slug: 'cheema-heart-complex',
    city: 'Lahore',
    address: 'DHA Phase 4, Lahore',
    phone: '+92 42 35761234',
    email: 'info@cheemaheart.com',
    description: 'Leading cardiac care center specializing in interventional cardiology and heart surgery.',
  },
  {
    name: 'National Hospital',
    slug: 'national-hospital',
    city: 'Karachi',
    address: 'Stadium Road, Karachi',
    phone: '+92 21 111000123',
    email: 'contact@nationalhospital.pk',
    description: 'Multi-specialty hospital offering general medicine, pediatrics, and emergency care.',
  },
  {
    name: 'Doctors Hospital',
    slug: 'doctors-hospital',
    city: 'Lahore',
    address: 'Jail Road, Lahore',
    phone: '+92 42 111000456',
    email: 'info@doctorshospital.com',
    description: 'Premium healthcare facility with dermatology, gynecology, and surgical specialties.',
  },
  {
    name: 'Shaukat Khanum Memorial Cancer Hospital',
    slug: 'shaukat-khanum',
    city: 'Lahore',
    address: 'Johar Town, Lahore',
    phone: '+92 42 35905000',
    email: 'info@shaukatkhanum.org.pk',
    description: 'World-class cancer hospital providing oncology, psychiatry, and supportive care services.',
  },
];

const DOCTOR_PRACTICE_SCHEDULES = {
  'Dr. Hassan Ali': [
    {
      hospitalSlug: 'cheema-heart-complex',
      days: ['Monday', 'Wednesday'],
      slots: ['09:00 AM - 01:00 PM'],
      fee: 2500,
    },
    {
      hospitalSlug: 'national-hospital',
      days: ['Tuesday', 'Friday'],
      slots: ['02:00 PM - 06:00 PM'],
      fee: 2800,
    },
  ],
  'Dr. Sara Ahmed': [
    {
      hospitalSlug: 'doctors-hospital',
      days: ['Tuesday', 'Thursday'],
      slots: ['10:00 AM - 02:00 PM'],
      fee: 2000,
    },
  ],
  'Dr. Ayesha Khan': [
    {
      hospitalSlug: 'national-hospital',
      days: ['Monday', 'Wednesday', 'Friday'],
      slots: ['09:00 AM - 12:00 PM'],
      fee: 1500,
    },
  ],
  'Dr. Omar Farooq': [
    {
      hospitalSlug: 'national-hospital',
      days: ['Tuesday', 'Thursday'],
      slots: ['11:00 AM - 03:00 PM'],
      fee: 1800,
    },
  ],
  'Dr. Fatima Rizvi': [
    {
      hospitalSlug: 'doctors-hospital',
      days: ['Monday', 'Wednesday', 'Saturday'],
      slots: ['10:00 AM - 01:00 PM'],
      fee: 2200,
    },
  ],
  'Dr. Imran Shah': [
    {
      hospitalSlug: 'shaukat-khanum',
      days: ['Thursday', 'Friday'],
      slots: ['03:00 PM - 07:00 PM'],
      fee: 3000,
    },
  ],
};

const buildLocationSchedule = (days, slots) =>
  days.map((day) => ({ day, slots }));

const DOCTOR_HOSPITAL_SLUG = {
  'Dr. Ayesha Khan': 'national-hospital',
  'Dr. Hassan Ali': 'cheema-heart-complex',
  'Dr. Sara Ahmed': 'doctors-hospital',
  'Dr. Omar Farooq': 'national-hospital',
  'Dr. Fatima Rizvi': 'doctors-hospital',
  'Dr. Imran Shah': 'shaukat-khanum',
};

const DOCTORS = [
  {
    name: 'Dr. Ayesha Khan',
    specialty: 'General Physician',
    experience_years: 12,
    rating: 4.9,
    reviews_count: 324,
    fee: 1500,
    online: true,
    available_today: true,
    languages: ['English', 'Urdu'],
    photo_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
    slots: ['10:00 AM', '11:30 AM', '2:00 PM', '4:30 PM', '6:00 PM'],
    about: 'MBBS, FCPS. Specializes in general medicine with focus on preventive care and chronic disease management.',
    qualifications: ['MBBS — Aga Khan University', 'FCPS — College of Physicians'],
    hospital: 'Aga Khan University Hospital',
  },
  {
    name: 'Dr. Hassan Ali',
    specialty: 'Cardiologist',
    experience_years: 15,
    rating: 4.8,
    reviews_count: 198,
    fee: 2500,
    online: true,
    available_today: true,
    languages: ['English', 'Urdu', 'Punjabi'],
    photo_url: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=400',
    slots: ['9:00 AM', '12:00 PM', '3:00 PM', '5:00 PM'],
    about: 'Interventional cardiologist with expertise in hypertension, heart failure, and preventive cardiology.',
    qualifications: ['MBBS', 'FRCP — Cardiology', 'Fellowship — Interventional Cardiology'],
    hospital: 'National Institute of Cardiovascular Diseases',
  },
  {
    name: 'Dr. Sara Ahmed',
    specialty: 'Dermatologist',
    experience_years: 8,
    rating: 4.9,
    reviews_count: 412,
    fee: 2000,
    online: true,
    available_today: false,
    languages: ['English', 'Urdu'],
    photo_url: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=400',
    slots: ['10:30 AM', '1:00 PM', '3:30 PM'],
    about: 'Board-certified dermatologist treating acne, eczema, psoriasis, and cosmetic dermatology concerns.',
    qualifications: ['MBBS', 'MD — Dermatology'],
    hospital: 'South City Hospital',
  },
  {
    name: 'Dr. Omar Farooq',
    specialty: 'Pediatrician',
    experience_years: 10,
    rating: 4.7,
    reviews_count: 267,
    fee: 1800,
    online: false,
    available_today: true,
    languages: ['English', 'Urdu', 'Sindhi'],
    photo_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400',
    slots: ['9:30 AM', '11:00 AM', '2:30 PM', '5:30 PM'],
    about: 'Pediatrician specializing in newborn care, vaccinations, and childhood illnesses.',
    qualifications: ['MBBS', 'FCPS — Pediatrics'],
    hospital: "Children's Hospital Lahore",
  },
  {
    name: 'Dr. Fatima Rizvi',
    specialty: 'Gynecologist',
    experience_years: 14,
    rating: 4.8,
    reviews_count: 189,
    fee: 2200,
    online: true,
    available_today: true,
    languages: ['English', 'Urdu'],
    photo_url: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&q=80&w=400',
    slots: ['10:00 AM', '12:30 PM', '3:00 PM', '6:30 PM'],
    about: "Experienced gynecologist providing comprehensive women's health services.",
    qualifications: ['MBBS', 'FCPS — Obstetrics & Gynecology'],
    hospital: 'Liaquat National Hospital',
  },
  {
    name: 'Dr. Imran Shah',
    specialty: 'Psychiatrist',
    experience_years: 18,
    rating: 4.6,
    reviews_count: 145,
    fee: 3000,
    online: true,
    available_today: false,
    languages: ['English', 'Urdu', 'Punjabi'],
    photo_url: 'https://images.unsplash.com/photo-1537368910022-7914809a2a3c?auto=format&fit=crop&q=80&w=400',
    slots: ['11:00 AM', '2:00 PM', '4:00 PM'],
    about: 'Consultant psychiatrist specializing in anxiety, depression, and stress-related disorders.',
    qualifications: ['MBBS', 'FCPS — Psychiatry'],
    hospital: 'Karwan-e-Hayat Hospital',
  },
];

const LAB_TESTS = [
  {
    name: 'Complete Blood Count (CBC)',
    lab: 'Chughtai Lab',
    category: 'blood',
    tests_included: 28,
    collection_time: '30–45 min',
    report_time: '6–8 hours',
    price: 1200,
    popular: true,
    home_collection: true,
    description: 'Comprehensive blood analysis including RBC, WBC, platelets, and hemoglobin levels.',
  },
  {
    name: 'HbA1c & Fasting Glucose',
    lab: 'Dr. Essa Laboratory',
    category: 'diabetes',
    tests_included: 2,
    collection_time: '20 min',
    report_time: '12 hours',
    price: 1800,
    popular: true,
    home_collection: true,
    description: 'Diabetes monitoring panel with HbA1c and fasting blood sugar.',
  },
  {
    name: 'Lipid Profile & Cardiac Risk',
    lab: 'Excel Labs',
    category: 'heart',
    tests_included: 8,
    collection_time: '30 min',
    report_time: '24 hours',
    price: 2500,
    popular: true,
    home_collection: true,
    description: 'Cholesterol, triglycerides, HDL, LDL, and cardiac risk markers.',
  },
  {
    name: 'Vitamin D & B12 Panel',
    lab: 'Chughtai Lab',
    category: 'vitamin',
    tests_included: 2,
    collection_time: '20 min',
    report_time: '24 hours',
    price: 3500,
    popular: false,
    home_collection: true,
    description: 'Vitamin D (25-OH) and Vitamin B12 deficiency screening.',
  },
  {
    name: 'Executive Full Body Checkup',
    lab: 'Shaukat Khanum Labs',
    category: 'full-body',
    tests_included: 65,
    collection_time: '45–60 min',
    report_time: '48 hours',
    price: 8999,
    popular: true,
    home_collection: true,
    description: 'Comprehensive health screening with 65+ parameters.',
    discount: '20% OFF',
  },
  {
    name: 'Thyroid Function Test (TFT)',
    lab: 'Dr. Essa Laboratory',
    category: 'blood',
    tests_included: 3,
    collection_time: '20 min',
    report_time: '12 hours',
    price: 2200,
    popular: false,
    home_collection: true,
    description: 'TSH, T3, and T4 levels for thyroid health assessment.',
  },
  {
    name: 'Diabetes Care Package',
    lab: 'Excel Labs',
    category: 'diabetes',
    tests_included: 6,
    collection_time: '30 min',
    report_time: '24 hours',
    price: 3200,
    popular: false,
    home_collection: true,
    description: 'HbA1c, fasting glucose, kidney function, and lipid panel for diabetics.',
  },
  {
    name: 'ECG + Stress Test Combo',
    lab: 'National Hospital Labs',
    category: 'heart',
    tests_included: 2,
    collection_time: '60 min',
    report_time: '24 hours',
    price: 4500,
    popular: false,
    home_collection: false,
    description: 'Electrocardiogram and treadmill stress test for heart health.',
  },
  {
    name: "Women's Wellness Package",
    lab: 'Shaukat Khanum Labs',
    category: 'full-body',
    tests_included: 35,
    collection_time: '40 min',
    report_time: '36 hours',
    price: 5499,
    popular: true,
    home_collection: true,
    description: 'Tailored health screening for women including hormonal and nutritional markers.',
    discount: '15% OFF',
  },
  {
    name: 'Iron & Calcium Profile',
    lab: 'Chughtai Lab',
    category: 'vitamin',
    tests_included: 4,
    collection_time: '25 min',
    report_time: '12 hours',
    price: 1600,
    popular: false,
    home_collection: true,
    description: 'Serum iron, ferritin, calcium, and vitamin D levels.',
  },
];

const DOCTOR_REVIEWS = [
  { author_name: 'Ali R.', rating: 5, comment: 'Very thorough consultation. Explained everything clearly.' },
  { author_name: 'Nadia K.', rating: 5, comment: 'Professional and caring. Video call quality was excellent.' },
  { author_name: 'Bilal M.', rating: 4, comment: 'Good experience overall. Doctor was punctual.' },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping destructive seed in production.');
    return;
  }

  console.log('Seeding database...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pharmahub.com' },
    update: {},
    create: {
      email: 'admin@pharmahub.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'admin',
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@pharmahub.com' },
    update: {},
    create: {
      email: 'customer@pharmahub.com',
      password: hashedPassword,
      name: 'John Doe',
      role: 'customer',
      addresses: [{ street: '123 Main St', city: 'Metropolis', zip: '12345' }],
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { email: 'vendor@pharmahub.com' },
    update: {
      address: 'DHA Phase 5, Lahore',
      city: 'Lahore',
      latitude: 31.47,
      longitude: 74.375,
      is_open: true,
      is_online: true,
      average_rating: 4.8,
    },
    create: {
      email: 'vendor@pharmahub.com',
      password: hashedPassword,
      business_name: 'City Pharmacy',
      license_number: 'LIC-12345',
      status: 'approved',
      commission_rate: 10.0,
      address: 'DHA Phase 5, Lahore',
      city: 'Lahore',
      latitude: 31.47,
      longitude: 74.375,
      is_open: true,
      is_online: true,
      average_rating: 4.8,
    },
  });

  const vendor2 = await prisma.vendor.upsert({
    where: { email: 'vendor2@pharmahub.com' },
    update: {
      address: 'Gulberg III, Lahore',
      city: 'Lahore',
      latitude: 31.52,
      longitude: 74.35,
      is_open: true,
      is_online: true,
      average_rating: 4.6,
    },
    create: {
      email: 'vendor2@pharmahub.com',
      password: hashedPassword,
      business_name: 'MedCo Pharma',
      license_number: 'LIC-67890',
      status: 'approved',
      commission_rate: 10.0,
      address: 'Gulberg III, Lahore',
      city: 'Lahore',
      latitude: 31.52,
      longitude: 74.35,
      is_open: true,
      is_online: true,
      average_rating: 4.6,
    },
  });

  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});

  await prisma.doctorReview.deleteMany({});
  await prisma.appointmentMessage.deleteMany({});
  await prisma.appointmentChat.deleteMany({});
  await prisma.doctorPrescription.deleteMany({});
  await prisma.doctorAppointment.deleteMany({});
  await prisma.labTestBooking.deleteMany({});
  await prisma.labTest.deleteMany({});
  await prisma.labPartner.deleteMany({});
  await prisma.doctorPracticeLocation.deleteMany({});
  await prisma.doctor.deleteMany({});
  await prisma.hospital.deleteMany({});

  const hospitalBySlug = {};
  for (const hospital of HOSPITALS) {
    const created = await prisma.hospital.create({ data: hospital });
    hospitalBySlug[hospital.slug] = created;
  }

  const resolveDoctorHospital = (doctor) => {
    const slug = DOCTOR_HOSPITAL_SLUG[doctor.name];
    if (!slug || !hospitalBySlug[slug]) {
      return { hospital_id: null, hospital: doctor.hospital || 'Independent Practice' };
    }
    return {
      hospital_id: hospitalBySlug[slug].id,
      hospital: hospitalBySlug[slug].name,
    };
  };

  const portalDoctorData = DOCTORS[0];
  const portalHospital = resolveDoctorHospital(portalDoctorData);
  const portalDoctor = await prisma.doctor.create({
    data: {
      ...portalDoctorData,
      ...portalHospital,
      email: 'doctor@pharmahub.com',
      password: hashedPassword,
      phone: '+92 300 1234567',
    },
  });

  const doctorMap = { [portalDoctorData.name]: portalDoctor };

  for (let i = 1; i < DOCTORS.length; i++) {
    const doctorData = DOCTORS[i];
    const hospitalLink = resolveDoctorHospital(doctorData);
    const created = await prisma.doctor.create({ data: { ...doctorData, ...hospitalLink } });
    doctorMap[doctorData.name] = created;
    for (const review of DOCTOR_REVIEWS) {
      await prisma.doctorReview.create({
        data: { ...review, doctor_id: created.id },
      });
    }
  }

  for (const [doctorName, locations] of Object.entries(DOCTOR_PRACTICE_SCHEDULES)) {
    const doctor = doctorMap[doctorName];
    if (!doctor) continue;

    for (const entry of locations) {
      const hospital = hospitalBySlug[entry.hospitalSlug];
      if (!hospital) continue;

      await prisma.doctorPracticeLocation.create({
        data: {
          doctor_id: doctor.id,
          hospital_id: hospital.id,
          fee: entry.fee,
          schedule: buildLocationSchedule(entry.days, entry.slots),
        },
      });
    }
  }

  for (const review of DOCTOR_REVIEWS) {
    await prisma.doctorReview.create({
      data: { ...review, doctor_id: portalDoctor.id },
    });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  await prisma.doctorAppointment.createMany({
    data: [
      {
        doctor_id: portalDoctor.id,
        customer_id: customer.id,
        slot: '10:00 AM',
        appointment_date: new Date(),
        fee: portalDoctor.fee,
        status: 'confirmed',
        payment_method: 'card',
      },
      {
        doctor_id: portalDoctor.id,
        customer_id: customer.id,
        slot: '11:30 AM',
        appointment_date: tomorrow,
        fee: portalDoctor.fee,
        status: 'pending',
        payment_method: 'cash',
      },
    ],
  });

  const chughtaiLab = await prisma.labPartner.create({
    data: {
      email: 'lab@pharmahub.com',
      password: hashedPassword,
      name: 'Chughtai Lab',
      license_number: 'PMDC-LAB-2024-0892',
      address: '7 Jail Road, Gulberg, Lahore',
      city: 'Lahore',
      phone: '+92 42 111 748 464',
      bio: "Pakistan's leading diagnostic laboratory with 100+ collection centers nationwide.",
      home_collection: true,
      operating_hours: 'Mon–Sat: 7:00 AM – 10:00 PM',
      collection_areas: 'Lahore, Karachi, Islamabad, Rawalpindi',
      status: 'approved',
    },
  });

  for (const test of LAB_TESTS) {
    const labPartnerId = test.lab === 'Chughtai Lab' ? chughtaiLab.id : null;
    const createdTest = await prisma.labTest.create({
      data: { ...test, lab_partner_id: labPartnerId },
    });

    if (labPartnerId) {
      await prisma.labTestBooking.create({
        data: {
          lab_test_id: createdTest.id,
          customer_id: customer.id,
          collection_address: { street: '123 Main St', city: 'Lahore', zip: '54000' },
          time_slot: '09:00 AM',
          collection_date: new Date(),
          price: createdTest.price,
          status: 'pending',
          payment_method: 'card',
        },
      });
    }
  }

  const cityProducts = await Promise.all([
    prisma.product.create({
      data: { vendor_id: vendor.id, name: 'Panadol Extra', formula: 'Paracetamol', category: 'Pain Relief', price: 120, stock: 240, description: 'Pain and fever relief' },
    }),
    prisma.product.create({
      data: { vendor_id: vendor.id, name: 'Augmentin 625mg', formula: 'Amoxicillin', category: 'Prescription', price: 380, stock: 85, description: 'Antibiotic tablets' },
    }),
    prisma.product.create({
      data: { vendor_id: vendor.id, name: 'Arinac Forte', formula: 'Ibuprofen', category: 'Pain Relief', price: 95, stock: 8, description: 'Anti-inflammatory' },
    }),
  ]);

  const medcoProducts = await Promise.all([
    prisma.product.create({
      data: { vendor_id: vendor2.id, name: 'Brufen 400mg', formula: 'Ibuprofen', category: 'Pain Relief', price: 110, stock: 160, description: 'Pain relief tablets' },
    }),
    prisma.product.create({
      data: { vendor_id: vendor2.id, name: 'Surbex Z', formula: 'Multivitamin', category: 'Vitamins & Supplements', price: 280, stock: 95, description: 'Vitamin supplement' },
    }),
  ]);

  const deliveryAddress = { street: '123 Main St', city: 'Lahore', zip: '54000' };

  await prisma.order.create({
    data: {
      customer_id: customer.id,
      vendor_id: vendor.id,
      total_amount: cityProducts[0].price * 2 + cityProducts[1].price,
      status: 'pending',
      delivery_address: deliveryAddress,
      items: {
        create: [
          { product_id: cityProducts[0].id, quantity: 2, unit_price: cityProducts[0].price },
          { product_id: cityProducts[1].id, quantity: 1, unit_price: cityProducts[1].price },
        ],
      },
    },
  });

  await prisma.order.create({
    data: {
      customer_id: customer.id,
      vendor_id: vendor2.id,
      total_amount: medcoProducts[0].price * 3 + medcoProducts[1].price,
      status: 'processing',
      delivery_address: deliveryAddress,
      items: {
        create: [
          { product_id: medcoProducts[0].id, quantity: 3, unit_price: medcoProducts[0].price },
          { product_id: medcoProducts[1].id, quantity: 1, unit_price: medcoProducts[1].price },
        ],
      },
    },
  });

  console.log({
    admin: admin.email,
    customer: customer.email,
    vendor: vendor.email,
    vendor2: vendor2.email,
    doctorPortal: 'doctor@pharmahub.com',
    labPortal: 'lab@pharmahub.com',
    password: 'password123',
    doctors: DOCTORS.length,
    hospitals: HOSPITALS.length,
    labTests: LAB_TESTS.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
