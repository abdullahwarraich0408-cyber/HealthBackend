const { signAccessToken, signRefreshToken } = require('./jwt.service');
const { createSession } = require('./session.service');
const { setTokenCookies } = require('../auth.helper');
const crypto = require('crypto');

function serializeUser(user, account) {
  return {
    id: user.id,
    accountId: account?.id || user.account_id,
    firebaseUid: user.firebase_uid,
    email: user.email || account?.email,
    phone: user.phone,
    name: user.name,
    avatar: user.avatar,
    dateOfBirth: user.date_of_birth,
    gender: user.gender,
    isVerified: user.is_verified,
    role: account?.role || user.role,
    membershipStatus: user.membership_status,
    membershipExpiry: user.membership_expiry,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function issueSession(user, account, meta, res) {
  const sessionId = crypto.randomUUID();

  const tokenPayload = {
    id: user.id,
    accountId: account?.id || user.account_id,
    role: account?.role || user.role,
    sessionId,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await createSessionWithId(user.id, sessionId, refreshToken, meta);

  const tokens = { accessToken, refreshToken };

  if (res) {
    setTokenCookies(res, accessToken, refreshToken);
  }

  return {
    user: serializeUser(user, account),
    tokens,
  };
}

async function createSessionWithId(userId, sessionId, refreshToken, meta) {
  const prisma = require('../../../config/database');
  const { hashRefreshToken } = require('./session.service');
  const { getRefreshExpiryDate } = require('./jwt.service');

  await prisma.userSession.create({
    data: {
      id: sessionId,
      user_id: userId,
      device_id: meta?.deviceId || 'unknown',
      platform: meta?.platform || 'web',
      refresh_token: hashRefreshToken(refreshToken),
      expires_at: getRefreshExpiryDate(),
    },
  });
}

module.exports = {
  serializeUser,
  issueSession,
  createSessionWithId,
};
