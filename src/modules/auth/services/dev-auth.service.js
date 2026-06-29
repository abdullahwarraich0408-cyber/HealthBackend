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
  const accountEmail = `${normalized.replace(/\+/g, '')}@dev.pharmahub.local`;

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

  return issueSession(user, account, meta, res);
}

module.exports = {
  authenticateDevTestLogin,
  DEV_TEST_ACCOUNTS,
};
