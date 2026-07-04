const prisma = require('../../config/database');

async function recordAuditEntry({
  vendorId = null,
  userId = null,
  action,
  entity = 'vendor',
  entityId = null,
  details = null,
}) {
  const auditPayload = {
    user_id: userId,
    action,
    entity,
    entity_id: entityId || vendorId,
    details: details || undefined,
  };

  await prisma.auditLog.create({ data: auditPayload });

  if (vendorId) {
    await prisma.vendorAuditLog.create({
      data: {
        vendor_id: vendorId,
        user_id: userId,
        action,
        entity,
        entity_id: entityId || vendorId,
        details: details || undefined,
      },
    });
  }
}

module.exports = {
  recordAuditEntry,
};
