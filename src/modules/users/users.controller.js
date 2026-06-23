const catchAsync = require('../../utils/catchAsync');
const usersService = require('./users.service');
const { sendResponse } = require('../../utils/response');

const getProfile = catchAsync(async (req, res) => {
  const user = await usersService.getUserProfile(req.user.id);
  sendResponse(res, 200, { user }, 'User profile fetched successfully');
});

const updateProfile = catchAsync(async (req, res) => {
  const user = await usersService.updateUserProfile(req.user.id, req.body);
  sendResponse(res, 200, { user }, 'User profile updated successfully');
});

const updateNotificationPreferences = catchAsync(async (req, res) => {
  const preferences = await usersService.updateNotificationPreferences(req.user.id, req.body);
  sendResponse(res, 200, { preferences }, 'Notification preferences updated successfully');
});

const changePassword = catchAsync(async (req, res) => {
  await usersService.changeUserPassword(
    req.user.id,
    req.body.current_password,
    req.body.new_password
  );
  sendResponse(res, 200, null, 'Password updated successfully');
});

module.exports = {
  getProfile,
  updateProfile,
  updateNotificationPreferences,
  changePassword,
};
