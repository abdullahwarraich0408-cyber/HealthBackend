const prisma = require('../../config/database');
const AppError = require('../../utils/appError');

const ALLOWED_ACTIONS = [
  'prescription',
  'doctors',
  'pharmacy',
  'labs',
  'hospitals',
];
const ALLOWED_AUDIENCES = ['first_visit', 'returning'];

const DEFAULT_SLIDES = [
  {
    id: 'home-first-1',
    audience: 'first_visit',
    slot: 1,
    title: 'Upload a prescription, get your medicines',
    cta: 'Upload Prescription',
    action: 'prescription',
    bg: '#156A96',
    label: 'Easy Medicine Ordering',
    description:
      'Have a prescription? Upload it securely and continue your medicine order.',
  },
  {
    id: 'home-first-2',
    audience: 'first_visit',
    slot: 2,
    title: 'Consult a doctor from wherever you are',
    cta: 'Find a Doctor',
    action: 'doctors',
    bg: '#0E7A72',
    label: 'Doctor Consultations',
    description:
      'Book an online or in-clinic consultation with healthcare professionals.',
  },
  {
    id: 'home-first-3',
    audience: 'first_visit',
    slot: 3,
    title: 'Find and order the medicines you need',
    cta: 'Shop Medicines',
    action: 'pharmacy',
    bg: '#124362',
    label: 'Online Pharmacy',
    description:
      'Search medicines and healthcare products from pharmacies on Medzoos.',
  },
  {
    id: 'home-first-4',
    audience: 'first_visit',
    slot: 4,
    title: 'Book lab tests with home sampling',
    cta: 'Book a Lab Test',
    action: 'labs',
    bg: '#1A7A88',
    label: 'Diagnostic Services',
    description:
      'Find diagnostic tests and request home sample collection where available.',
    badge: 'Home Sampling Available',
  },
  {
    id: 'home-offer-1',
    audience: 'returning',
    slot: 1,
    title: 'Flat 25% off on medicines',
    cta: 'Shop now',
    action: 'pharmacy',
    bg: '#156A96',
    label: 'Limited offer',
    description: 'Save on medicines from pharmacies on Medzoos.',
    badge: '25% OFF',
  },
  {
    id: 'home-offer-2',
    audience: 'returning',
    slot: 2,
    title: 'First consult from the comfort of home',
    cta: 'Book now',
    action: 'doctors',
    bg: '#0E7A72',
    label: 'Doctor offer',
    description: 'Book an online consultation with a Medzoos doctor.',
  },
  {
    id: 'home-offer-3',
    audience: 'returning',
    slot: 3,
    title: 'Lab tests with home sampling',
    cta: 'Book test',
    action: 'labs',
    bg: '#1A7A88',
    label: 'Lab offer',
    description: 'Book diagnostic tests with home sample collection.',
    badge: 'Home sampling',
  },
  {
    id: 'home-offer-4',
    audience: 'returning',
    slot: 4,
    title: 'Hospital care, booked in minutes',
    cta: 'Find hospitals',
    action: 'hospitals',
    bg: '#124362',
    label: 'Hospital offer',
    description: 'Book visits at leading hospitals on Medzoos.',
  },
];

async function seedIfEmpty() {
  const count = await prisma.homeSlide.count();
  if (count > 0) return;
  await prisma.homeSlide.createMany({ data: DEFAULT_SLIDES });
}

async function listPublic(audience) {
  if (!ALLOWED_AUDIENCES.includes(audience)) {
    throw new AppError('Invalid audience', 400);
  }
  await seedIfEmpty();
  return prisma.homeSlide.findMany({
    where: { audience, is_active: true },
    orderBy: { slot: 'asc' },
    take: 4,
  });
}

async function listAdmin() {
  await seedIfEmpty();
  return prisma.homeSlide.findMany({
    orderBy: [{ audience: 'asc' }, { slot: 'asc' }],
  });
}

async function updateSlide(id, payload) {
  const existing = await prisma.homeSlide.findUnique({ where: { id } });
  if (!existing) throw new AppError('Poster not found', 404);

  const data = {};
  if (payload.title != null) data.title = String(payload.title).trim();
  if (payload.cta != null) data.cta = String(payload.cta).trim();
  if (payload.label != null) data.label = String(payload.label).trim() || null;
  if (payload.description != null) {
    data.description = String(payload.description).trim() || null;
  }
  if (payload.badge != null) data.badge = String(payload.badge).trim() || null;
  if (payload.bg != null) data.bg = String(payload.bg).trim() || existing.bg;
  if (payload.image_url != null) data.image_url = String(payload.image_url).trim();
  if (payload.is_active != null) data.is_active = Boolean(payload.is_active);
  if (payload.action != null) {
    if (!ALLOWED_ACTIONS.includes(payload.action)) {
      throw new AppError('Invalid poster action', 400);
    }
    data.action = payload.action;
  }

  if (data.title === '') throw new AppError('Title is required', 400);
  if (data.cta === '') throw new AppError('Button text is required', 400);

  return prisma.homeSlide.update({ where: { id }, data });
}

module.exports = {
  listPublic,
  listAdmin,
  updateSlide,
  ALLOWED_ACTIONS,
};
