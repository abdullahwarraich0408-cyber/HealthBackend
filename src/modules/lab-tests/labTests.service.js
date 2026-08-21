const { randomUUID } = require('crypto');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { emitOrderUpdated } = require('../../utils/orderTracking.socket');
const inboxEvents = require('../notifications/inbox.events');

const CATEGORIES = [
  { id: 'blood', label: 'Blood', icon: '🩸' },
  { id: 'diabetes', label: 'Diabetes', icon: '💉' },
  { id: 'heart', label: 'Heart', icon: '❤️' },
  { id: 'vitamin', label: 'Vitamin', icon: '💊' },
  { id: 'full-body', label: 'Full Body Checkup', icon: '🧬' },
];

const TIME_SLOTS = [
  '7:00 AM – 9:00 AM',
  '9:00 AM – 11:00 AM',
  '11:00 AM – 1:00 PM',
  '2:00 PM – 4:00 PM',
  '4:00 PM – 6:00 PM',
  '6:00 PM – 8:00 PM',
];

const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'collector_assigned',
  'sample_collected',
  'testing',
  'report_uploaded',
  'completed',
  'cancelled',
  'rejected',
];

const bookingInclude = {
  lab_test: {
    select: {
      id: true,
      name: true,
      lab: true,
      category: true,
      tests_included: true,
      report_time: true,
      collection_time: true,
      home_collection: true,
      fasting_required: true,
      preparation: true,
      lab_partner_id: true,
    },
  },
  lab_partner: {
    select: { id: true, name: true, phone: true, address: true, city: true },
  },
  customer: { select: { id: true, name: true, email: true, phone: true } },
};

const getCategories = async () => CATEGORIES;
const getTimeSlots = async () => TIME_SLOTS;

const getLabTests = async (query = {}) => {
  const where = { is_active: true };
  if (query.category) where.category = query.category;
  if (query.popular === 'true') where.popular = true;
  if (query.lab_partner_id) where.lab_partner_id = query.lab_partner_id;
  if (query.home_collection === 'true') where.home_collection = true;

  let tests = await prisma.labTest.findMany({
    where,
    include: {
      lab_partner: {
        select: { id: true, name: true, city: true, rating: true, home_collection: true },
      },
    },
    orderBy: [{ popular: 'desc' }, { name: 'asc' }],
  });

  if (query.q) {
    const q = query.q.toLowerCase();
    tests = tests.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.lab.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }

  return tests;
};

const getPopularLabTests = async () =>
  prisma.labTest.findMany({
    where: { is_active: true, popular: true },
    include: {
      lab_partner: { select: { id: true, name: true, rating: true, home_collection: true } },
    },
    orderBy: { name: 'asc' },
  });

const getLabTestById = async (id) => {
  const test = await prisma.labTest.findUnique({
    where: { id },
    include: {
      lab_partner: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          phone: true,
          bio: true,
          rating: true,
          home_collection: true,
          operating_hours: true,
          collection_areas: true,
        },
      },
    },
  });
  if (!test || !test.is_active) throw new AppError('Lab test not found', 404);
  return test;
};

const getLabs = async (query = {}) => {
  const where = { status: 'approved' };
  if (query.home_collection === 'true') where.home_collection = true;
  if (query.city) {
    where.OR = [
      { city: { contains: query.city, mode: 'insensitive' } },
      { collection_areas: { contains: query.city, mode: 'insensitive' } },
    ];
  }

  const labs = await prisma.labPartner.findMany({
    where,
    include: {
      lab_tests: {
        where: { is_active: true },
        select: {
          id: true,
          name: true,
          price: true,
          report_time: true,
          home_collection: true,
          popular: true,
        },
      },
    },
    orderBy: [{ rating: 'desc' }, { name: 'asc' }],
  });

  let result = labs.map((lab) => ({
    ...lab,
    test_count: lab.lab_tests.length,
    min_price: lab.lab_tests.length
      ? Math.min(...lab.lab_tests.map((t) => t.price))
      : null,
  }));

  if (query.q) {
    const q = query.q.toLowerCase();
    result = result.filter(
      (lab) =>
        lab.name.toLowerCase().includes(q) ||
        (lab.city && lab.city.toLowerCase().includes(q))
    );
  }

  return result;
};

const getLabById = async (id) => {
  const lab = await prisma.labPartner.findUnique({
    where: { id },
    include: {
      lab_tests: {
        where: { is_active: true },
        orderBy: [{ popular: 'desc' }, { name: 'asc' }],
      },
    },
  });
  if (!lab || lab.status !== 'approved') throw new AppError('Lab not found', 404);
  return lab;
};

const countSlotBookings = async (labPartnerId, collectionDate, timeSlot) => {
  const dayStart = new Date(collectionDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(collectionDate);
  dayEnd.setHours(23, 59, 59, 999);

  return prisma.labTestBooking.count({
    where: {
      lab_partner_id: labPartnerId,
      time_slot: timeSlot,
      collection_date: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['cancelled', 'rejected'] },
    },
  });
};

const SLOT_CAPACITY = 5;

const findBestLabForHomeCollection = async (test, city) => {
  if (test.lab_partner_id) {
    const lab = await prisma.labPartner.findFirst({
      where: { id: test.lab_partner_id, status: 'approved', home_collection: true },
    });
    if (lab) return lab;
  }

  const labs = await prisma.labPartner.findMany({
    where: {
      status: 'approved',
      home_collection: true,
      OR: city
        ? [
            { city: { contains: city, mode: 'insensitive' } },
            { collection_areas: { contains: city, mode: 'insensitive' } },
          ]
        : undefined,
      lab_tests: { some: { id: test.id, is_active: true } },
    },
    orderBy: [{ rating: 'desc' }, { name: 'asc' }],
  });

  return labs[0] || null;
};

const resolvePaymentStatus = (paymentMethod) => {
  // COD and Stripe both start pending; Stripe verify marks paid + confirmed
  return 'pending';
};

const resolveInitialStatus = (paymentMethod) => {
  const method = String(paymentMethod || '').toLowerCase();
  if (method === 'stripe' || method === 'card' || method === 'online') {
    return 'pending';
  }
  return 'pending';
};

const createBookingRecord = async ({
  test,
  customerId,
  labPartnerId,
  orderGroupId,
  payload,
  collectionDate,
}) => {
  const collectionType = String(payload.collection_type || 'HOME').toUpperCase();
  const paymentMethod = String(payload.payment_method || 'stripe').toLowerCase();
  const isVisitLab = collectionType === 'VISIT_LAB' || collectionType === 'LAB';
  const isCod = paymentMethod === 'cod' || paymentMethod === 'cash';

  // Home collection → Stripe only (no cash handoff until collector; digital PDF prepaid)
  // Visit lab → Stripe or cash at counter (lab portal marks paid on sample collection)
  if (isCod && !isVisitLab) {
    throw new AppError(
      'Cash payment is only available when you visit the lab. Home collection requires online payment.',
      400
    );
  }
  if (!isCod && !['stripe', 'card', 'online'].includes(paymentMethod)) {
    throw new AppError('Invalid payment method', 400);
  }

  if (collectionType === 'HOME' && !test.home_collection) {
    throw new AppError(`${test.name} does not support home collection`, 400);
  }

  if (labPartnerId) {
    const slotCount = await countSlotBookings(labPartnerId, collectionDate, payload.time_slot);
    if (slotCount >= SLOT_CAPACITY) {
      throw new AppError('Selected time slot is full. Please choose another slot.', 400);
    }
  }

  const normalizedMethod = isCod ? 'cod' : 'stripe';

  const booking = await prisma.labTestBooking.create({
    data: {
      order_group_id: orderGroupId,
      lab_test_id: test.id,
      lab_partner_id: labPartnerId,
      customer_id: customerId,
      patient_name: payload.patient_name,
      patient_gender: payload.patient_gender,
      patient_age: payload.patient_age ? Number(payload.patient_age) : null,
      collection_type: collectionType === 'VISIT_LAB' || collectionType === 'LAB' ? 'VISIT_LAB' : 'HOME',
      collection_address:
        collectionType === 'HOME' ? payload.collection_address : payload.collection_address || null,
      time_slot: payload.time_slot,
      collection_date: collectionDate,
      price: test.price,
      payment_method: normalizedMethod,
      payment_status: 'pending',
      prescription_url: payload.prescription_url || null,
      status: 'pending',
    },
    include: bookingInclude,
  });

  await inboxEvents.labBookingCreated(booking);
  return booking;
};

const bookLabTest = async (customerId, data) => {
  const test = await getLabTestById(data.lab_test_id);

  if (!TIME_SLOTS.includes(data.time_slot)) {
    throw new AppError('Invalid time slot selected', 400);
  }

  const collectionDate = data.collection_date ? new Date(data.collection_date) : new Date();
  const collectionType = data.collection_type || 'HOME';
  const city = data.collection_address?.city;

  let labPartnerId = test.lab_partner_id;
  if (collectionType === 'HOME') {
    const lab = await findBestLabForHomeCollection(test, city);
    if (!lab) throw new AppError('No lab available for home collection in your area', 400);
    labPartnerId = lab.id;
  } else if (!labPartnerId) {
    throw new AppError('This test requires lab partner assignment', 400);
  }

  return createBookingRecord({
    test,
    customerId,
    labPartnerId,
    orderGroupId: randomUUID(),
    payload: data,
    collectionDate,
  });
};

const createLabOrder = async (customerId, data) => {
  const testIds = data.lab_test_ids || [];
  if (!testIds.length) throw new AppError('At least one test is required', 400);
  if (!TIME_SLOTS.includes(data.time_slot)) {
    throw new AppError('Invalid time slot selected', 400);
  }

  const tests = await prisma.labTest.findMany({
    where: { id: { in: testIds }, is_active: true },
  });
  if (tests.length !== testIds.length) {
    throw new AppError('One or more tests are unavailable', 400);
  }

  const collectionDate = data.collection_date ? new Date(data.collection_date) : new Date();
  const collectionType = data.collection_type || 'HOME';
  const city = data.collection_address?.city;

  const groups = new Map();
  for (const test of tests) {
    let partnerId = test.lab_partner_id;
    if (collectionType === 'HOME') {
      const lab = await findBestLabForHomeCollection(test, city);
      if (!lab) {
        throw new AppError(`No lab available for home collection: ${test.name}`, 400);
      }
      partnerId = lab.id;
    } else if (!partnerId) {
      throw new AppError(`${test.name} has no assigned lab for visit booking`, 400);
    }

    if (!groups.has(partnerId)) groups.set(partnerId, []);
    groups.get(partnerId).push(test);
  }

  const finalOrders = [];
  for (const [partnerId, groupTests] of groups) {
    const orderGroupId = randomUUID();
    for (const test of groupTests) {
      const booking = await createBookingRecord({
        test,
        customerId,
        labPartnerId: partnerId,
        orderGroupId,
        payload: data,
        collectionDate,
      });
      finalOrders.push(booking);
    }
  }

  return {
    orders: finalOrders,
    order_groups: [...new Set(finalOrders.map((o) => o.order_group_id))],
    total: finalOrders.reduce((sum, o) => sum + o.price, 0),
  };
};

const getCustomerBookings = async (customerId) =>
  prisma.labTestBooking.findMany({
    where: { customer_id: customerId },
    include: bookingInclude,
    orderBy: { collection_date: 'desc' },
  });

const getCustomerReports = async (customerId) => {
  const bookings = await prisma.labTestBooking.findMany({
    where: {
      customer_id: customerId,
      report_url: { not: null },
      payment_status: 'paid',
    },
    include: bookingInclude,
    orderBy: { updated_at: 'desc' },
  });
  return bookings;
};

const cancelBooking = async (customerId, bookingId) => {
  const booking = await prisma.labTestBooking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.customer_id !== customerId) throw new AppError('Unauthorized', 403);
  if (['cancelled', 'completed', 'report_uploaded'].includes(booking.status)) {
    throw new AppError(`Cannot cancel a booking with status "${booking.status}"`, 400);
  }

  const cancelled = await prisma.labTestBooking.update({
    where: { id: bookingId },
    data: { status: 'cancelled' },
    include: bookingInclude,
  });

  await inboxEvents.labBookingStatus({ booking: cancelled, status: 'cancelled' });
  return cancelled;
};

const getLabBookings = async (labPartnerId) =>
  prisma.labTestBooking.findMany({
    where: { lab_partner_id: labPartnerId },
    include: bookingInclude,
    orderBy: { collection_date: 'desc' },
  });

const normalizeBookingStatus = (status = '') => {
  const s = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === 'new' || s === 'pending') return 'pending';
  if (s === 'accepted' || s === 'confirmed') return 'confirmed';
  if (s === 'collector_assigned' || s === 'dispatched') return 'collector_assigned';
  if (s === 'sample_collected' || s === 'collected') return 'sample_collected';
  if (s === 'processing' || s === 'testing' || s === 'in_progress') return 'testing';
  if (s === 'report_ready' || s === 'report_uploaded' || s === 'ready') return 'report_uploaded';
  if (s === 'completed' || s === 'done') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'rejected' || s === 'declined') return 'rejected';
  return s;
};

const updateBookingStatus = async (labPartnerId, bookingId, rawStatus, note) => {
  const status = normalizeBookingStatus(rawStatus);
  if (!BOOKING_STATUSES.includes(status)) {
    throw new AppError(`Invalid status: ${rawStatus}. Allowed: ${BOOKING_STATUSES.join(', ')}`, 400);
  }

  const booking = await prisma.labTestBooking.findFirst({
    where: { id: bookingId, lab_partner_id: labPartnerId },
    include: { lab_test: true },
  });
  if (!booking) throw new AppError('Booking not found', 404);

  const updateData = {
    status,
    notes: note !== undefined && note !== null && note !== '' ? note : booking.notes,
  };

  if (status === 'sample_collected' && !booking.sample_collected_at) {
    updateData.sample_collected_at = new Date();
  }

  // Cash at lab counter: when sample is collected, reception has taken payment
  const method = String(booking.payment_method || '').toLowerCase();
  const isCash = method === 'cod' || method === 'cash';
  if (
    isCash &&
    booking.payment_status !== 'paid' &&
    ['sample_collected', 'testing', 'report_uploaded', 'completed'].includes(status)
  ) {
    updateData.payment_status = 'paid';
  }

  if (status === 'completed' && booking.payment_status !== 'paid') {
    updateData.payment_status = 'paid';
  }

  const updated = await prisma.labTestBooking.update({
    where: { id: bookingId },
    data: updateData,
    include: bookingInclude,
  });

  emitOrderUpdated({
    orderId: updated.id,
    status: updated.status,
    type: 'lab',
    customerId: updated.customer_id,
    vendorId: updated.lab_partner_id,
  });

  await inboxEvents.labBookingStatus({ booking: updated, status: updated.status });
  return updated;
};

const markPaymentReceived = async (labPartnerId, bookingId) => {
  const booking = await prisma.labTestBooking.findFirst({
    where: { id: bookingId, lab_partner_id: labPartnerId },
    include: bookingInclude,
  });
  if (!booking) throw new AppError('Booking not found', 404);

  if (booking.payment_status === 'paid') {
    return booking;
  }

  const method = String(booking.payment_method || '').toLowerCase();
  if (!['cod', 'cash'].includes(method)) {
    throw new AppError('Only cash / pay-at-lab bookings can be marked paid from the lab portal', 400);
  }

  const updated = await prisma.labTestBooking.update({
    where: { id: bookingId },
    data: { payment_status: 'paid' },
    include: bookingInclude,
  });

  return updated;
};

const uploadReport = async (labPartnerId, bookingId, reportUrl) => {
  if (!reportUrl || !String(reportUrl).trim()) {
    throw new AppError('Report URL is required', 400);
  }

  const booking = await prisma.labTestBooking.findFirst({
    where: { id: bookingId, lab_partner_id: labPartnerId },
  });
  if (!booking) throw new AppError('Booking not found', 404);
  if (['cancelled', 'rejected'].includes(booking.status)) {
    throw new AppError('Cannot upload report for cancelled booking', 400);
  }

  const updated = await prisma.labTestBooking.update({
    where: { id: bookingId },
    data: {
      report_url: String(reportUrl).trim(),
      status: 'report_uploaded',
    },
    include: bookingInclude,
  });

  await inboxEvents.labReportReady(updated);
  return updated;
};

const assignCollector = async (labPartnerId, bookingId, payload = {}) => {
  const collector_name = payload.collector_name || payload.name || 'Assigned Collector';
  const collector_phone = payload.collector_phone || payload.phone || '';
  const note = payload.note || payload.notes;

  const booking = await prisma.labTestBooking.findFirst({
    where: { id: bookingId, lab_partner_id: labPartnerId },
  });
  if (!booking) throw new AppError('Booking not found', 404);

  const updated = await prisma.labTestBooking.update({
    where: { id: bookingId },
    data: {
      collector_name,
      collector_phone,
      status: 'collector_assigned',
      notes: note ?? booking.notes,
    },
    include: bookingInclude,
  });

  emitOrderUpdated({
    orderId: updated.id,
    status: updated.status,
    type: 'lab',
    customerId: updated.customer_id,
    vendorId: updated.lab_partner_id,
  });

  await inboxEvents.labCollectorAssigned(updated);
  return updated;
};

const getAllBookings = async () =>
  prisma.labTestBooking.findMany({
    include: bookingInclude,
    orderBy: { created_at: 'desc' },
  });

module.exports = {
  getCategories,
  getTimeSlots,
  getLabTests,
  getPopularLabTests,
  getLabTestById,
  getLabs,
  getLabById,
  bookLabTest,
  createLabOrder,
  getCustomerBookings,
  getCustomerReports,
  cancelBooking,
  getLabBookings,
  updateBookingStatus,
  markPaymentReceived,
  uploadReport,
  assignCollector,
  getAllBookings,
  TIME_SLOTS,
  BOOKING_STATUSES,
};
