const prisma = require('../../../config/database');
const AppError = require('../../../utils/AppError');
const env = require('../../../config/env');
const { issueSession } = require('./token.service');

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

  let user = await prisma.user.findUnique({
    where: { phone: normalized },
    include: { account: true },
  });

  if (user) return user;

  const accountEmail = `${normalized.replace(/\+/g, '')}@dev.pharmahub.local`;

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
}

async function authenticateDevTestLogin(phone, code, meta, res) {
  if (env.NODE_ENV === 'production') {
    throw new AppError('Dev login is not available in production', 403);
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

  return issueSession(user, account, meta, res);
}

module.exports = {
  authenticateDevTestLogin,
  DEV_TEST_ACCOUNTS,
};
