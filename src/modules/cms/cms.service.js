const prisma = require('../../config/database');
const AppError = require('../../utils/appError');

const SECTIONS = ['care_actions', 'specialties', 'banners'];
const CHANNELS = ['app', 'website', 'both'];

const DEFAULT_ITEMS = [
  { id: 'care-1', section: 'care_actions', channel: 'app', sort_order: 1, title: 'Find doctor', subtitle: 'Online consult', icon: 'stethoscope', action: 'doctors', href: '/doctors' },
  { id: 'care-2', section: 'care_actions', channel: 'app', sort_order: 2, title: 'Clinic visit', subtitle: 'Book in person', icon: 'hospital-building', action: 'clinic', href: '/doctors?consult=in_person' },
  { id: 'care-3', section: 'care_actions', channel: 'app', sort_order: 3, title: 'Order medicines', subtitle: 'Pharmacy', icon: 'pill', action: 'pharmacy', href: '/vendors' },
  { id: 'care-4', section: 'care_actions', channel: 'app', sort_order: 4, title: 'Book lab test', subtitle: 'Home or lab', icon: 'flask-outline', action: 'labs', href: '/lab-tests' },
  { id: 'spec-1', section: 'specialties', channel: 'both', sort_order: 1, title: 'Cardiology', icon: 'heart-pulse', action: 'doctors', href: '/doctors?q=cardiology', meta: 'Cardiologist' },
  { id: 'spec-2', section: 'specialties', channel: 'both', sort_order: 2, title: 'Paediatrics', icon: 'baby-face-outline', action: 'doctors', href: '/doctors?q=pediatrics', meta: 'Pediatrician' },
  { id: 'spec-3', section: 'specialties', channel: 'both', sort_order: 3, title: 'Urology', icon: 'water', action: 'doctors', href: '/doctors?q=urology', meta: 'Urologist' },
  { id: 'spec-4', section: 'specialties', channel: 'both', sort_order: 4, title: 'Neurology', icon: 'brain', action: 'doctors', href: '/doctors?q=neurology', meta: 'Neurologist' },
  { id: 'spec-5', section: 'specialties', channel: 'both', sort_order: 5, title: 'Dermatology', icon: 'face-woman-shimmer', action: 'doctors', href: '/doctors?q=dermatology', meta: 'Dermatologist' },
  { id: 'spec-6', section: 'specialties', channel: 'both', sort_order: 6, title: 'Orthopedics', icon: 'bone', action: 'doctors', href: '/doctors?q=orthopedics', meta: 'Orthopedist' },
  { id: 'spec-7', section: 'specialties', channel: 'both', sort_order: 7, title: 'General', icon: 'stethoscope', action: 'doctors', href: '/doctors', meta: 'General Physician' },
];

const DEFAULT_SETTINGS = {
  tagline: 'Care That Fits Your Life.',
  contact_phone: '+92 300 123 4567',
  contact_email: 'support@medzoos.pk',
  contact_address: 'DHA Phase 6, Karachi, Pakistan',
  landing_eyebrow: 'Healthcare, made simpler',
  landing_headline: 'Your Healthcare. One Trusted Platform.',
  landing_subhead: 'Doctors, medicines, labs, and hospitals — in one place.',
  landing_cta_primary: 'Find a Doctor',
  landing_cta_secondary: 'Explore services',
  play_store_url: '',
  app_store_url: '',
};

function pick(payload, keys) {
  const data = {};
  for (const key of keys) {
    if (payload[key] !== undefined) data[key] = payload[key];
  }
  return data;
}

async function seedIfEmpty() {
  const [itemCount, settingCount] = await Promise.all([
    prisma.contentItem.count(),
    prisma.siteSetting.count(),
  ]);
  if (itemCount === 0) {
    await prisma.contentItem.createMany({ data: DEFAULT_ITEMS });
  }
  if (settingCount === 0) {
    await prisma.siteSetting.createMany({
      data: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
    });
  }
}

async function listPublic(section, channel = 'both') {
  await seedIfEmpty();
  const where = { is_active: true };
  if (section) {
    if (!SECTIONS.includes(section) && section !== 'all') {
      throw new AppError('Unknown content section', 400);
    }
    if (section !== 'all') where.section = section;
  }
  if (channel && channel !== 'both') {
    where.OR = [{ channel: 'both' }, { channel }];
  }
  return prisma.contentItem.findMany({
    where,
    orderBy: [{ section: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
  });
}

async function listAdmin(section) {
  await seedIfEmpty();
  return prisma.contentItem.findMany({
    where: section ? { section } : undefined,
    orderBy: [{ section: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
  });
}

async function createItem(payload) {
  if (!SECTIONS.includes(payload.section)) {
    throw new AppError('Unknown content section', 400);
  }
  if (!payload.title || !String(payload.title).trim()) {
    throw new AppError('Title is required', 400);
  }
  const channel = CHANNELS.includes(payload.channel) ? payload.channel : 'both';
  const last = await prisma.contentItem.findFirst({
    where: { section: payload.section },
    orderBy: { sort_order: 'desc' },
  });
  return prisma.contentItem.create({
    data: {
      section: payload.section,
      channel,
      sort_order: payload.sort_order ?? (last ? last.sort_order + 1 : 1),
      title: String(payload.title).trim(),
      subtitle: payload.subtitle || '',
      body: payload.body || '',
      cta: payload.cta || '',
      action: payload.action || '',
      href: payload.href || '',
      icon: payload.icon || '',
      image_url: payload.image_url || '',
      bg: payload.bg || '',
      badge: payload.badge || '',
      meta: payload.meta || '',
      is_active: payload.is_active !== false,
    },
  });
}

async function updateItem(id, payload) {
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Content item not found', 404);
  if (payload.section && !SECTIONS.includes(payload.section)) {
    throw new AppError('Unknown content section', 400);
  }
  if (payload.channel && !CHANNELS.includes(payload.channel)) {
    throw new AppError('Invalid channel', 400);
  }
  const data = pick(payload, [
    'section', 'channel', 'sort_order', 'title', 'subtitle', 'body',
    'cta', 'action', 'href', 'icon', 'image_url', 'bg', 'badge', 'meta', 'is_active',
  ]);
  if (data.title != null) data.title = String(data.title).trim();
  return prisma.contentItem.update({ where: { id }, data });
}

async function deleteItem(id) {
  const existing = await prisma.contentItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Content item not found', 404);
  await prisma.contentItem.delete({ where: { id } });
}

async function getSettings() {
  await seedIfEmpty();
  const rows = await prisma.siteSetting.findMany();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

async function updateSettings(payload = {}) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const entries = Object.entries(payload).filter(([key]) => allowed.includes(key));
  await Promise.all(
    entries.map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: String(value ?? '') },
        create: { key, value: String(value ?? '') },
      }),
    ),
  );
  return getSettings();
}

module.exports = {
  SECTIONS,
  listPublic,
  listAdmin,
  createItem,
  updateItem,
  deleteItem,
  getSettings,
  updateSettings,
};
