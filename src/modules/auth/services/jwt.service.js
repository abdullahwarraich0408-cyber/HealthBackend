const jwt = require('jsonwebtoken');
const env = require('../../../config/env');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function buildPayload(user) {
  return {
    id: user.id,
    accountId: user.accountId || user.account_id,
    role: user.role || 'customer',
    sessionId: user.sessionId,
  };
}

function signAccessToken(user) {
  return jwt.sign(buildPayload(user), env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken(user) {
  return jwt.sign(buildPayload(user), env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

function getRefreshExpiryDate() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshExpiryDate,
};
