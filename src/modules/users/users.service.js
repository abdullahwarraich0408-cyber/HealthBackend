const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { hashPassword, comparePassword } = require('../auth/auth.helper');

const getUserProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      addresses: true,
      profile_data: true,
      notification_preferences: true,
      created_at: true,
      updated_at: true
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const updateUserProfile = async (userId, data) => {
  const { profile_data, ...rest } = data;
  const updateData = { ...rest };

  if (profile_data !== undefined) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { profile_data: true },
    });
    updateData.profile_data = {
      ...(existing?.profile_data || {}),
      ...profile_data,
    };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      addresses: true,
      profile_data: true,
      notification_preferences: true,
      created_at: true,
      updated_at: true
    }
  });

  return user;
};

const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.password) {
    throw new AppError('Password change is not available for this account', 400);
  }

  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) {
    throw new AppError('Current password is incorrect', 401);
  }

  const hashedPassword = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

const updateNotificationPreferences = async (userId, preferences) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const currentPrefs = user.notification_preferences || { email: true, sms: false, push: true };
  const updatedPrefs = {
    ...currentPrefs,
    ...preferences
  };

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { notification_preferences: updatedPrefs },
    select: { notification_preferences: true }
  });

  return updatedUser.notification_preferences;
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  updateNotificationPreferences
};
