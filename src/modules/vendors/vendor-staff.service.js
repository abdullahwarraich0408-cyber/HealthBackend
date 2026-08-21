const crypto = require('crypto');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { hashPassword } = require('../auth/auth.helper');
const { recordAuditEntry } = require('./vendor-audit.service');
const { STAFF_ROLES } = require('../pharmacy/catalog.constants');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function listStaff(vendorId) {
  return prisma.vendorStaff.findMany({
    where: { vendor_id: vendorId },
    orderBy: { created_at: 'asc' },
    include: { account: { select: { email: true, is_active: true } } },
  });
}

async function inviteStaff(vendorId, data, performedBy) {
  const email = normalizeEmail(data.email);
  const role = String(data.role || 'VIEWER').toUpperCase();
  if (!STAFF_ROLES.includes(role) || role === 'OWNER') {
    throw new AppError('Invalid staff role', 400);
  }
  if (!email || !data.name) throw new AppError('Name and email are required', 400);

  const existing = await prisma.vendorStaff.findFirst({
    where: { vendor_id: vendorId, email },
  });
  if (existing) throw new AppError('This email is already on the staff list', 409);

  const tempPassword = data.password || `Mz${crypto.randomBytes(4).toString('hex')}!`;
  const hashed = await hashPassword(tempPassword);

  const staff = await prisma.$transaction(async (tx) => {
    let account = await tx.account.findUnique({ where: { email } });
    if (account && account.role !== 'vendor') {
      throw new AppError('This email is already registered on another portal', 409);
    }
    if (!account) {
      account = await tx.account.create({
        data: {
          email,
          password: hashed,
          role: 'vendor',
          is_active: true,
        },
      });
    }

    return tx.vendorStaff.create({
      data: {
        vendor_id: vendorId,
        account_id: account.id,
        name: data.name,
        email,
        role,
        status: 'active',
        accepted_at: new Date(),
      },
    });
  });

  await recordAuditEntry({
    vendorId,
    userId: performedBy || vendorId,
    action: 'STAFF_INVITED',
    entity: 'vendor_staff',
    entityId: staff.id,
    details: { email, role },
  });

  return { staff, temporary_password: tempPassword };
}

async function updateStaff(vendorId, staffId, data, performedBy) {
  const staff = await prisma.vendorStaff.findFirst({
    where: { id: staffId, vendor_id: vendorId },
  });
  if (!staff) throw new AppError('Staff member not found', 404);

  const role = data.role ? String(data.role).toUpperCase() : undefined;
  if (role && (!STAFF_ROLES.includes(role) || role === 'OWNER')) {
    throw new AppError('Invalid staff role', 400);
  }

  const updated = await prisma.vendorStaff.update({
    where: { id: staffId },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(role ? { role } : {}),
      ...(data.status ? { status: data.status } : {}),
    },
  });

  if (data.status === 'disabled' && staff.account_id) {
    await prisma.account.update({
      where: { id: staff.account_id },
      data: { is_active: false },
    });
  }

  await recordAuditEntry({
    vendorId,
    userId: performedBy || vendorId,
    action: 'STAFF_PERMISSION_CHANGED',
    entity: 'vendor_staff',
    entityId: staffId,
    details: { from: staff.role, to: updated.role, status: updated.status },
  });

  return updated;
}

module.exports = {
  listStaff,
  inviteStaff,
  updateStaff,
};
