const AppError = require('../utils/AppError');
const { protect, restrictTo } = require('./auth.middleware');

const requireAuth = protect;

const requireRole = (...roles) => restrictTo(...roles);

const requireAdmin = restrictTo('admin');
const requireCustomer = restrictTo('customer', 'admin');
const requireDoctor = restrictTo('doctor', 'admin');
const requirePharmacy = restrictTo('vendor', 'admin');
const requireLab = restrictTo('lab', 'admin');
const requireHospital = restrictTo('hospital', 'admin');

const optionalAuth = (req, res, next) => {
  const hasBearer =
    req.headers.authorization && req.headers.authorization.startsWith('Bearer');
  const hasCookie = req.cookies?.accessToken;

  if (!hasBearer && !hasCookie) {
    return next();
  }

  return protect(req, res, next);
};

module.exports = {
  protect,
  restrictTo,
  requireAuth,
  requireRole,
  requireAdmin,
  requireCustomer,
  requireDoctor,
  requirePharmacy,
  requireLab,
  requireHospital,
  optionalAuth,
};
