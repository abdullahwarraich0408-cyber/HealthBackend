const AppError = require('../../utils/AppError');
const { STAFF_ROLES } = require('./catalog.constants');

const PERMISSIONS = {
  OWNER: ['*'],
  MANAGER: [
    'products.read',
    'products.write',
    'inventory.read',
    'inventory.write',
    'orders.read',
    'orders.write',
    'prescriptions.read',
    'prescriptions.review',
    'reports.read',
    'staff.read',
    'staff.write',
    'settings.read',
    'settings.write',
    'returns.read',
    'returns.write',
    'payouts.read',
    'notifications.read',
    'audit.read',
  ],
  PHARMACIST: [
    'products.read',
    'inventory.read',
    'orders.read',
    'orders.write',
    'prescriptions.read',
    'prescriptions.review',
    'notifications.read',
  ],
  INVENTORY_MANAGER: [
    'products.read',
    'products.write',
    'inventory.read',
    'inventory.write',
    'notifications.read',
  ],
  ORDER_STAFF: [
    'products.read',
    'inventory.read',
    'orders.read',
    'orders.write',
    'notifications.read',
  ],
  VIEWER: [
    'products.read',
    'inventory.read',
    'orders.read',
    'reports.read',
    'payouts.read',
    'notifications.read',
  ],
};

function getStaffRole(user) {
  const role = String(user?.staffRole || user?.staff_role || 'OWNER').toUpperCase();
  return STAFF_ROLES.includes(role) ? role : 'OWNER';
}

function hasPermission(user, permission) {
  if (!permission) return true;
  const role = getStaffRole(user);
  const grants = PERMISSIONS[role] || [];
  if (grants.includes('*')) return true;
  return grants.includes(permission);
}

function assertPermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw new AppError('You do not have permission to perform this action', 403);
  }
}

function canReviewPrescriptions(user) {
  return hasPermission(user, 'prescriptions.review');
}

function requireVendorPermission(permission) {
  return (req, res, next) => {
    try {
      assertPermission(req.user, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireSellingAllowed(req, res, next) {
  if (req.user?.sellingAllowed === false) {
    return next(new AppError('Your pharmacy cannot sell until the account is active.', 403));
  }
  return next();
}

module.exports = {
  PERMISSIONS,
  getStaffRole,
  hasPermission,
  assertPermission,
  canReviewPrescriptions,
  requireVendorPermission,
  requireSellingAllowed,
};
