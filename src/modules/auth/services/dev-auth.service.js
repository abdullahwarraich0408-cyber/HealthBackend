const prisma = require('../../../config/database');
const AppError = require('../../../utils/AppError');
const env = require('../../../config/env');
const { issueSession, serializeUser } = require('./token.service');
const { generateTokens, setTokenCookies } = require('../auth.helper');
const redisClient = require('../../../config/redis');
const { logger } = require('../../../utils/logger');

const DEV_TEST_ACCOUNTS = [
  { phone: '+923361400372', code: '123456' },
  { phone: '+923361400373', code: '123456' },
];

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s-]/g, '');
}

function findDevTestAccount(phone, code) {
  const normalized = normalizePhone(phone);
  return DEV_TEST_ACCOUNTS.find(
    (entry) => normalizePhone(entry.phone) === normalized && entry.code === code,
  );
}

async function findOrCreateDevUser(phone) {
  const normalized = normalizePhone(phone);
  const accountEmail = `${normalized.replace(/\+/g, '')}@dev.pharmahub.local`;

  try {
    let user = await prisma.user.findUnique({
      where: { phone: normalized },
      include: { account: true },
    });

    if (user) {
      if (user.account) return user;

      let account = await prisma.account.findUnique({ where: { email: accountEmail } });
      if (!account) {
        account = await prisma.account.create({
          data: { email: accountEmail, password: null, role: 'customer' },
        });
      }

      return prisma.user.update({
        where: { id: user.id },
        data: { account_id: account.id },
        include: { account: true },
      });
    }

    const existingAccount = await prisma.account.findUnique({
      where: { email: accountEmail },
      include: { customer: true },
    });

    if (existingAccount?.customer) {
      return { ...existingAccount.customer, account: existingAccount };
    }

    const account = await prisma.account.create({
      data: {
        email: accountEmail,
        password: null,
        role: 'customer',
        customer: {
          create: {
            phone: normalized,
            email: null,
            name: '',
            is_verified: true,
            role: 'customer',
            membership_status: 'FREE',
          },
        },
      },
      include: { customer: true },
    });

    return { ...account.customer, account };
  } catch (err) {
    logger.warn(`Dev user unified account path failed: ${err.message}`);
  }

  let legacyUser = await prisma.user.findUnique({ where: { phone: normalized } });
  if (legacyUser) return legacyUser;

  return prisma.user.create({
    data: {
      phone: normalized,
      name: '',
      role: 'customer',
    },
  });
}

async function storeLegacyRefreshToken(userId, refreshToken) {
  try {
    await redisClient.set(
      `refresh_token:${userId}:${refreshToken}`,
      'valid',
      'EX',
      7 * 24 * 60 * 60,
    );
  } catch {
    // Redis optional — tokens still work without server-side refresh tracking
  }
}

async function issueLegacySession(user, account, res) {
  const tokens = generateTokens({
    id: user.id,
    role: account?.role || user.role,
    accountId: account?.id || user.account_id,
  });

  await storeLegacyRefreshToken(user.id, tokens.refreshToken);

  if (res) {
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
  }

  return {
    user: serializeUser(user, account),
    tokens,
  };
}

async function authenticateDevTestLogin(phone, code, meta, res) {
  const testAuthAllowed = env.NODE_ENV !== 'production' || env.ENABLE_TEST_AUTH;
  if (!testAuthAllowed) {
    throw new AppError('Test login is not available', 403);
  }

  const match = findDevTestAccount(phone, code);
  if (!match) {
    throw new AppError('Invalid dev test phone or OTP code', 401);
  }

  const user = await findOrCreateDevUser(match.phone);
  const account = user.account;

  if (account && !account.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  try {
    return await issueSession(user, account, meta, res);
  } catch (err) {
    logger.warn(`Dev login session fallback: ${err.message}`);
    return issueLegacySession(user, account, res);
  }
}

module.exports = {
  authenticateDevTestLogin,
  DEV_TEST_ACCOUNTS,
};
