const crypto = require('crypto');
const prisma = require('../../../config/database');
const AppError = require('../../../utils/AppError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('./jwt.service');
const {
  findSessionByRefreshToken,
  revokeSession,
  revokeAllSessions,
  hashRefreshToken,
} = require('./session.service');
const { getRefreshExpiryDate } = require('./jwt.service');
const { setTokenCookies } = require('../auth.helper');
const { serializeUser } = require('./token.service');

async function refreshAuthSession(refreshToken, meta, res) {
  if (!refreshToken) {
    throw new AppError('No refresh token provided', 401);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401);
  }

  const session = await findSessionByRefreshToken(refreshToken);
  if (!session) {
    throw new AppError('Refresh token revoked or expired', 401);
  }

  const user = session.user;
  const account = user.account;

  if (account && !account.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  const newSessionId = crypto.randomUUID();

  const tokenPayload = {
    id: user.id,
    accountId: account?.id || user.account_id,
    role: account?.role || user.role,
    sessionId: newSessionId,
  };

  const accessToken = signAccessToken(tokenPayload);
  const newRefreshToken = signRefreshToken(tokenPayload);

  await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
  await prisma.userSession.create({
    data: {
      id: newSessionId,
      user_id: user.id,
      device_id: meta?.deviceId || session.device_id,
      platform: meta?.platform || session.platform,
      refresh_token: hashRefreshToken(newRefreshToken),
      expires_at: getRefreshExpiryDate(),
    },
  });

  const tokens = { accessToken, refreshToken: newRefreshToken };

  if (res) {
    setTokenCookies(res, accessToken, newRefreshToken);
  }

  return { tokens, user: serializeUser(user, account) };
}

async function logoutSession(userId, refreshToken) {
  if (refreshToken) {
    await revokeSession(refreshToken);
  }
}

async function logoutAllSessions(userId) {
  await revokeAllSessions(userId);
}

async function getAuthenticatedUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { account: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return serializeUser(user, user.account);
}

async function updateUserProfile(userId, data) {
  const updates = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.avatar !== undefined) updates.avatar = data.avatar || null;
  if (data.gender !== undefined) updates.gender = data.gender;
  if (data.dateOfBirth !== undefined) {
    updates.date_of_birth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    include: { account: true },
  });

  return serializeUser(user, user.account);
}

async function deleteUserAccount(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { account: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  await revokeAllSessions(userId);

  if (user.account_id) {
    await prisma.account.delete({ where: { id: user.account_id } });
  } else {
    await prisma.user.delete({ where: { id: userId } });
  }

  return { deleted: true };
}

module.exports = {
  refreshAuthSession,
  logoutSession,
  logoutAllSessions,
  getAuthenticatedUser,
  updateUserProfile,
  deleteUserAccount,
};
