const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/database');

const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  // Unified lookup: The token payload should contain `accountId`
  const accountId = decoded.accountId || decoded.id;

  let currentAccount = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      customer: true,
      vendor: true,
      doctor: true,
      lab_partner: true,
    }
  });

  if (!currentAccount && decoded.role === 'vendor') {
    const vendorProfile = await prisma.vendor.findUnique({
      where: { id: decoded.id },
      include: {
        account: {
          include: {
            customer: true,
            vendor: true,
            doctor: true,
            lab_partner: true,
          }
        }
      }
    });
    if (vendorProfile?.account) {
      currentAccount = vendorProfile.account;
    }
  }

  if (!currentAccount || !currentAccount.is_active) {
    // If account not found, fallback to legacy check in case migration isn't run yet
    const legacyUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (legacyUser) {
      req.user = legacyUser;
      return next();
    }
    const legacyVendor = await prisma.vendor.findUnique({ where: { id: decoded.id } });
    if (legacyVendor) {
      req.user = { ...legacyVendor, role: 'vendor' };
      return next();
    }
    if (decoded.role === 'lab') {
      const legacyLab = await prisma.labPartner.findUnique({ where: { id: decoded.id } });
      if (legacyLab) {
        req.user = { ...legacyLab, role: 'lab' };
        return next();
      }
    }
    if (decoded.role === 'doctor') {
      const legacyDoctor = await prisma.doctor.findUnique({ where: { id: decoded.id } });
      if (legacyDoctor) {
        req.user = { ...legacyDoctor, role: 'doctor' };
        return next();
      }
    }
    return next(new AppError('The account belonging to this token no longer exists.', 401));
  }

  // Attach profile to req.user based on role
  let profile = null;
  if (currentAccount.role === 'customer' || currentAccount.role === 'admin') {
    profile = currentAccount.customer;
  } else if (currentAccount.role === 'vendor') {
    profile = currentAccount.vendor;
  } else if (currentAccount.role === 'doctor') {
    profile = currentAccount.doctor;
  } else if (currentAccount.role === 'lab') {
    profile = currentAccount.lab_partner;
  }

  if (!profile) {
    return next(new AppError('Profile not found for this account.', 401));
  }

  req.user = { ...profile, role: currentAccount.role, accountId: currentAccount.id };
  next();
});

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

module.exports = { protect, restrictTo };
