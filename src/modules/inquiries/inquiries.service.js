const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const inboxEvents = require('../notifications/inbox.events');

async function createInquiry(payload, userId = null) {
  const inquiry = await prisma.contactInquiry.create({
    data: {
      first_name: payload.first_name.trim(),
      last_name: (payload.last_name || '').trim(),
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone || null,
      type: payload.type || 'general',
      subject: payload.subject || '',
      message: payload.message.trim(),
      user_id: userId || null,
    },
  });

  await inboxEvents.contactInquiry(inquiry);
  return inquiry;
}

async function listInquiries() {
  return prisma.contactInquiry.findMany({
    orderBy: { created_at: 'desc' },
    take: 200,
  });
}

async function updateInquiry(id, { status }) {
  const existing = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!existing) throw new AppError('Inquiry not found', 404);

  return prisma.contactInquiry.update({
    where: { id },
    data: status ? { status } : {},
  });
}

module.exports = {
  createInquiry,
  listInquiries,
  updateInquiry,
};
