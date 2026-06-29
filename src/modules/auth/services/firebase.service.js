const prisma = require('../../../config/database');
const AppError = require('../../../utils/AppError');
const { verifyFirebaseIdToken } = require('../../../config/firebase');
const { issueSession } = require('./token.service');

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\s+/g, '');
}

function buildPlaceholderEmail(firebaseUid) {
  return `${firebaseUid}@firebase.pharmahub.local`;
}

function extractFirebaseProfile(decoded) {
  const firebaseUid = decoded.uid;
  const phone = normalizePhone(decoded.phone_number);
  const email = decoded.email || null;
  const name = decoded.name || decoded.display_name || '';
  const avatar = decoded.picture || null;
  const isVerified = Boolean(decoded.email_verified || decoded.phone_number);

  return { firebaseUid, phone, email, name, avatar, isVerified };
}

async function findUserByFirebaseIdentity({ firebaseUid, phone, email }) {
  if (firebaseUid) {
    const byUid = await prisma.user.findUnique({
      where: { firebase_uid: firebaseUid },
      include: { account: true },
    });
    if (byUid) return byUid;
  }

  if (phone) {
    const byPhone = await prisma.user.findUnique({
      where: { phone },
      include: { account: true },
    });
    if (byPhone) return byPhone;
  }

  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { email },
      include: { account: true },
    });
    if (byEmail) return byEmail;
  }

  return null;
}

async function createFirebaseUser(profile) {
  const accountEmail = profile.email || buildPlaceholderEmail(profile.firebaseUid);

  const existingAccount = await prisma.account.findUnique({
    where: { email: accountEmail },
  });
  if (existingAccount) {
    throw new AppError('An account with this email already exists', 409);
  }

  const account = await prisma.account.create({
    data: {
      email: accountEmail,
      password: null,
      role: 'customer',
      customer: {
        create: {
          firebase_uid: profile.firebaseUid,
          email: profile.email,
          phone: profile.phone,
          name: profile.name || '',
          avatar: profile.avatar,
          is_verified: profile.isVerified,
          role: 'customer',
          membership_status: 'FREE',
        },
      },
    },
    include: { customer: true },
  });

  return { ...account.customer, account };
}

async function linkFirebaseToUser(user, profile) {
  const updates = {};

  if (!user.firebase_uid && profile.firebaseUid) {
    updates.firebase_uid = profile.firebaseUid;
  }
  if (!user.phone && profile.phone) {
    updates.phone = profile.phone;
  }
  if (!user.email && profile.email) {
    updates.email = profile.email;
  }
  if (!user.name && profile.name) {
    updates.name = profile.name;
  }
  if (!user.avatar && profile.avatar) {
    updates.avatar = profile.avatar;
  }
  if (profile.isVerified) {
    updates.is_verified = true;
  }

  if (Object.keys(updates).length === 0) {
    return user;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: updates,
    include: { account: true },
  });
}

async function authenticateWithFirebaseIdToken(idToken, meta, res) {
  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    throw new AppError(err.message || 'Invalid Firebase token', 401);
  }

  const profile = extractFirebaseProfile(decoded);
  if (!profile.firebaseUid) {
    throw new AppError('Firebase token missing uid', 401);
  }

  let user = await findUserByFirebaseIdentity(profile);

  if (!user) {
    user = await createFirebaseUser(profile);
  } else {
    user = await linkFirebaseToUser(user, profile);
  }

  const account = user.account;
  if (account && !account.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  return issueSession(user, account, meta, res);
}

async function authenticateWithGoogleIdToken(idToken, meta, res) {
  return authenticateWithFirebaseIdToken(idToken, meta, res);
}

async function authenticateWithAppleIdToken(idToken, meta, res) {
  return authenticateWithFirebaseIdToken(idToken, meta, res);
}

module.exports = {
  authenticateWithFirebaseIdToken,
  authenticateWithGoogleIdToken,
  authenticateWithAppleIdToken,
  extractFirebaseProfile,
  findUserByFirebaseIdentity,
};
