const prisma = require('../../config/database');
const redisClient = require('../../config/redis');
const AppError = require('../../utils/AppError');
const { hashPassword, comparePassword, generateTokens, generatePartnerTokens } = require('./auth.helper');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

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

const registerUser = async (data) => {
  const existingAccount = await prisma.account.findUnique({ where: { email: data.email } });
  if (existingAccount) {
    throw new AppError('Email already in use', 400);
  }

  const hashedPassword = await hashPassword(data.password);
  
  // Create Unified Account
  const account = await prisma.account.create({
    data: {
      email: data.email,
      password: hashedPassword,
      role: 'customer',
      customer: {
        create: {
          name: data.name,
          phone: data.phone,
          addresses: data.addresses,
          role: 'customer'
        }
      }
    },
    include: { customer: true }
  });

  const tokens = generateTokens({ ...account.customer, accountId: account.id, role: account.role });
  
  // Store refresh token in Redis
  await storeRefreshToken(account.id, tokens.refreshToken);

  return { user: { ...account.customer, accountId: account.id }, tokens };
};

const loginUser = async (email, password) => {
  const account = await prisma.account.findUnique({ 
    where: { email },
    include: { customer: true }
  });
  
  if (!account || (account.role !== 'customer' && account.role !== 'admin')) {
    // Fallback to old user table during transition
    const legacyUser = await prisma.user.findUnique({ where: { email } });
    if (!legacyUser) throw new AppError('Invalid email or password', 401);
    
    const isMatch = await comparePassword(password, legacyUser.password);
    if (!isMatch) throw new AppError('Invalid email or password', 401);
    
    const tokens = generateTokens(legacyUser);
    await storeRefreshToken(legacyUser.id, tokens.refreshToken);
    return { user: legacyUser, tokens };
  }

  if (!account.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  const isMatch = await comparePassword(password, account.password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const profile = account.customer;
  const tokens = generateTokens({ ...profile, accountId: account.id, role: account.role });
  
  await storeRefreshToken(account.id, tokens.refreshToken);

  return { user: { ...profile, accountId: account.id, role: account.role }, tokens };
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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent return for security

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Save hashed token in Redis with 15 mins expiry
  await redisClient.set(`pwdReset:${hashedToken}`, user.id, 'EX', 15 * 60);

  // In a real app, send an email. For now, we simulate it.
  const resetUrl = `https://pharmahub.com/reset-password/${resetToken}`;
  console.log(`Password reset link for ${email}: ${resetUrl}`);
};

const resetPassword = async (token, newPassword) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const userId = await redisClient.get(`pwdReset:${hashedToken}`);

  if (!userId) {
    throw new AppError('Token is invalid or has expired', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword }
  });

  await redisClient.del(`pwdReset:${hashedToken}`);
};

const isApprovedPartnerStatus = (status) => ['approved', 'active'].includes(status);

const loginPartner = async (portal, email, password) => {
  const account = await prisma.account.findUnique({ 
    where: { email: email.trim().toLowerCase() },
    include: { vendor: true, doctor: true, lab_partner: true }
  });

  if (!account) {
    // Fallback to legacy
    return await legacyLoginPartner(portal, email, password);
  }

  if (portal === 'vendor' && account.role !== 'vendor') throw new AppError('Invalid portal type', 400);
  if (portal === 'doctor' && account.role !== 'doctor') throw new AppError('Invalid portal type', 400);
  if (portal === 'lab' && account.role !== 'lab') throw new AppError('Invalid portal type', 400);

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
    if (!profile?.is_active) throw new AppError('Your account is inactive', 403);
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
    if (partner.status !== 'approved') throw new AppError('Your vendor account is pending approval or has been rejected', 403);
  } else if (portal === 'doctor') {
    partner = await prisma.doctor.findUnique({ where: { email } });
    if (!partner || !partner.password) throw new AppError('Invalid email or password', 401);
    if (!partner.is_active) throw new AppError('Your doctor account is inactive', 403);
  } else if (portal === 'lab') {
    partner = await prisma.labPartner.findUnique({ where: { email } });
    if (!partner) throw new AppError('Invalid email or password', 401);
    if (partner.status !== 'approved') throw new AppError('Your lab account is pending approval or has been rejected', 403);
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
