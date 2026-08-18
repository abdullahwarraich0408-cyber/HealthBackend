const prisma = require('../../config/database');
const redisClient = require('../../config/redis');
const AppError = require('../../utils/AppError');
const { hashPassword, comparePassword, generateTokens, generatePartnerTokens } = require('./auth.helper');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const crypto = require('crypto');
const { issueSession } = require('./services/token.service');

const storeRefreshToken = async (userId, refreshToken, value = 'valid') => {
  try {
    await redisClient.set(
      `refresh_token:${userId}:${refreshToken}`,
      value,
      'EX',
      7 * 24 * 60 * 60
    );
  } catch {
    // Allow auth to work when Redis is unavailable (local dev)
  }
};

const registerUser = async (data, meta, res) => {
  const email = String(data.email || '').trim().toLowerCase();
  const existingAccount = await prisma.account.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existingAccount) {
    if (existingAccount.role !== 'customer' && existingAccount.role !== 'admin') {
      throw new AppError(
        `This email is already registered as a ${existingAccount.role} account. Use that portal, or sign up with a different email.`,
        400
      );
    }
    throw new AppError('Email already in use', 400);
  }

  const hashedPassword = await hashPassword(data.password);
  
  // Create Unified Account
  const account = await prisma.account.create({
    data: {
      email,
      password: hashedPassword,
      role: 'customer',
      customer: {
        create: {
          name: data.name,
          email,
          phone: data.phone || null,
          addresses: data.addresses,
          role: 'customer'
        }
      }
    },
    include: { customer: true }
  });

  return issueSession(account.customer, account, meta, res, { includeAccessToken: false });
};

const loginUser = async (email, password, meta, res) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const account = await prisma.account.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    include: { customer: true }
  });
  
  if (!account) {
    // Fallback to old user table during transition
    const legacyUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (!legacyUser) throw new AppError('Invalid email or password', 401);
    
    const isMatch = await comparePassword(password, legacyUser.password);
    if (!isMatch) throw new AppError('Invalid email or password', 401);
    
    return issueSession(legacyUser, null, meta, res, { includeAccessToken: false });
  }

  if (account.role !== 'customer' && account.role !== 'admin') {
    throw new AppError(
      `This email is registered as a ${account.role} account. Please use the ${account.role} portal to log in.`,
      400
    );
  }

  if (!account.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  if (!account.password) {
    throw new AppError('This account does not have a password yet. Use Forgot password to create one.', 400);
  }

  const isMatch = await comparePassword(password, account.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  let profile = account.customer;
  if (!profile && account.role === 'admin') {
    profile = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (!profile) {
      profile = await prisma.user.create({
        data: {
          account_id: account.id,
          email: normalizedEmail,
          name: 'Super Admin',
          role: 'admin',
        },
      });
    } else if (!profile.account_id) {
      await prisma.user.update({
        where: { id: profile.id },
        data: { account_id: account.id },
      });
    }
  }

  if (!profile) {
    throw new AppError('Profile not found for this account', 404);
  }

  return issueSession(profile, account, meta, res, { includeAccessToken: false });
};

const refreshAuthToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    const accountId = decoded.accountId || decoded.id;
    
    const isValid = await redisClient.get(`refresh_token:${accountId}:${refreshToken}`);
    if (!isValid) {
      throw new AppError('Refresh token revoked or invalid', 401);
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { customer: true, vendor: true, doctor: true, lab_partner: true }
    });

    if (!account) {
      // Legacy refresh fallback
      return await handleLegacyRefresh(decoded, refreshToken);
    }

    if (!account.is_active) throw new AppError('Account disabled', 403);

    let profile = null;
    let tokens;

    if (account.role === 'customer' || account.role === 'admin') profile = account.customer;
    if (account.role === 'vendor') profile = account.vendor;
    if (account.role === 'doctor') profile = account.doctor;
    if (account.role === 'lab') profile = account.lab_partner;

    const payload = { ...profile, accountId: account.id, role: account.role };

    if (['vendor', 'doctor', 'lab'].includes(account.role)) {
      tokens = generatePartnerTokens(payload, account.role);
    } else {
      tokens = generateTokens(payload);
    }

    await redisClient.del(`refresh_token:${accountId}:${refreshToken}`);
    await storeRefreshToken(account.id, tokens.refreshToken, account.role);

    return tokens;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid refresh token', 401);
  }
};

async function handleLegacyRefresh(decoded, refreshToken) {
  // Legacy logic fallback code
  let legacyAccount;
  let tokens;
  if (decoded.role && ['vendor', 'doctor', 'lab'].includes(decoded.role)) {
    if (decoded.role === 'vendor') legacyAccount = await prisma.vendor.findUnique({ where: { id: decoded.id } });
    if (decoded.role === 'doctor') legacyAccount = await prisma.doctor.findUnique({ where: { id: decoded.id } });
    if (decoded.role === 'lab') legacyAccount = await prisma.labPartner.findUnique({ where: { id: decoded.id } });
    if (!legacyAccount) throw new AppError('Partner account not found', 404);
    tokens = generatePartnerTokens(legacyAccount, decoded.role);
  } else {
    legacyAccount = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!legacyAccount) throw new AppError('User not found', 404);
    tokens = generateTokens(legacyAccount);
  }
  await redisClient.del(`refresh_token:${decoded.id}:${refreshToken}`);
  await storeRefreshToken(legacyAccount.id, tokens.refreshToken, decoded.role || 'customer');
  return tokens;
}

const logoutUser = async (userId, refreshToken) => {
  if (refreshToken) {
    // We could delete just the specific token
    await redisClient.del(`refresh_token:${userId}:${refreshToken}`);
    // Or we could delete all refresh tokens for this user by pattern matching (more complex in redis but safer)
  }
};

const forgotPassword = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;

  const account = await prisma.account.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
      role: { in: ['customer', 'admin'] },
    },
  });

  let subject = null;
  if (account) {
    subject = `account:${account.id}`;
  } else {
    const legacyUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (!legacyUser) return;
    subject = `legacy:${legacyUser.id}`;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  try {
    await redisClient.set(`pwdReset:${hashedToken}`, subject, 'EX', 15 * 60);
  } catch {
    throw new AppError('Password reset is temporarily unavailable. Please try again shortly.', 503);
  }

  const frontendUrl = String(env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
  console.log(`Password reset link for ${normalizedEmail}: ${resetUrl}`);
};

const resetPassword = async (token, newPassword) => {
  if (!newPassword || String(newPassword).length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  let stored;
  try {
    stored = await redisClient.get(`pwdReset:${hashedToken}`);
  } catch {
    throw new AppError('Password reset is temporarily unavailable. Please try again shortly.', 503);
  }

  if (!stored) {
    throw new AppError('Token is invalid or has expired', 400);
  }

  const hashedPassword = await hashPassword(newPassword);

  if (stored.startsWith('account:')) {
    await prisma.account.update({
      where: { id: stored.slice('account:'.length) },
      data: { password: hashedPassword },
    });
  } else if (stored.startsWith('legacy:')) {
    await prisma.user.update({
      where: { id: stored.slice('legacy:'.length) },
      data: { password: hashedPassword },
    });
  } else {
    const legacy = await prisma.user.findUnique({ where: { id: stored } }).catch(() => null);
    if (legacy) {
      await prisma.user.update({
        where: { id: stored },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.account.update({
        where: { id: stored },
        data: { password: hashedPassword },
      });
    }
  }

  await redisClient.del(`pwdReset:${hashedToken}`);
};

const isApprovedPartnerStatus = (status) => ['approved', 'active'].includes(status);

const PARTNER_PORTALS = ['vendor', 'doctor', 'lab'];
const PORTAL_LABELS = { vendor: 'Vendor', doctor: 'Doctor', lab: 'Lab' };

const assertPartnerPortalAccess = (portal, accountRole) => {
  if (accountRole === portal) return;

  if (PARTNER_PORTALS.includes(accountRole)) {
    throw new AppError(
      `This email is registered as a ${PORTAL_LABELS[accountRole]} account. Please use the ${PORTAL_LABELS[accountRole]} portal to log in.`,
      400
    );
  }

  throw new AppError(
    'This account cannot access partner portals. Use the customer or admin login instead.',
    403
  );
};

const loginPartner = async (portal, email, password) => {
  const account = await prisma.account.findUnique({ 
    where: { email: email.trim().toLowerCase() },
    include: { vendor: true, doctor: true, lab_partner: true }
  });

  if (!account) {
    // Fallback to legacy
    return await legacyLoginPartner(portal, email, password);
  }

  assertPartnerPortalAccess(portal, account.role);

  const isMatch = await comparePassword(password, account.password);
  if (!isMatch && portal === 'vendor' && account.vendor?.password) {
    const legacyMatch = await comparePassword(password, account.vendor.password);
    if (legacyMatch) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: account.vendor.password }
      });
    } else {
      throw new AppError('Invalid email or password', 401);
    }
  } else if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!account.is_active) throw new AppError('Account disabled', 403);

  let profile = null;
  if (portal === 'vendor') {
    profile = account.vendor;
    if (!profile) throw new AppError('Vendor profile not found for this account', 403);
    if (!isApprovedPartnerStatus(profile.status)) {
      throw new AppError('Your account is pending approval or rejected', 403);
    }
  } else if (portal === 'doctor') {
    profile = account.doctor;
    if (!profile) throw new AppError('Doctor profile not found for this account', 403);
    if (!profile.is_active) throw new AppError('Your doctor account is inactive. Contact support to reactivate it.', 403);
  } else if (portal === 'lab') {
    profile = account.lab_partner;
    if (!profile) throw new AppError('Lab profile not found for this account', 403);
    if (!isApprovedPartnerStatus(profile.status)) {
      throw new AppError('Your account is pending approval or rejected', 403);
    }
  }

  const role = portal;
  const payload = { ...profile, accountId: account.id, role };
  const tokens = generatePartnerTokens(payload, role);

  await storeRefreshToken(account.id, tokens.refreshToken, role);
  return { partner: { ...profile, accountId: account.id }, role, tokens };
};

async function legacyLoginPartner(portal, email, password) {
  let partner;
  if (portal === 'vendor') {
    partner = await prisma.vendor.findUnique({ where: { email } });
    if (!partner) throw new AppError('Invalid email or password', 401);
    if (!isApprovedPartnerStatus(partner.status)) throw new AppError('Your vendor account is pending approval or has been rejected', 403);
  } else if (portal === 'doctor') {
    partner = await prisma.doctor.findUnique({ where: { email } });
    if (!partner || !partner.password) throw new AppError('Invalid email or password', 401);
    if (!partner.is_active) throw new AppError('Your doctor account is inactive', 403);
  } else if (portal === 'lab') {
    partner = await prisma.labPartner.findUnique({ where: { email } });
    if (!partner) throw new AppError('Invalid email or password', 401);
    if (!isApprovedPartnerStatus(partner.status)) throw new AppError('Your lab account is pending approval or has been rejected', 403);
  } else {
    throw new AppError('Invalid portal type', 400);
  }

  const isMatch = await comparePassword(password, partner.password);
  if (!isMatch) throw new AppError('Invalid email or password', 401);

  const role = portal === 'lab' ? 'lab' : portal;
  const tokens = generatePartnerTokens(partner, role);
  await storeRefreshToken(partner.id, tokens.refreshToken, role);

  return { partner, role, tokens };
}

module.exports = {
  registerUser,
  loginUser,
  refreshAuthToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  loginPartner,
};
