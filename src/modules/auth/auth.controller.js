const catchAsync = require('../../utils/catchAsync');
const authService = require('./auth.service');
const firebaseAuthService = require('./services/firebase.service');
const devAuthService = require('./services/dev-auth.service');
const authSessionService = require('./services/auth-session.service');
const { sendResponse } = require('../../utils/response');
const { setTokenCookies, clearTokenCookies } = require('./auth.helper');

const register = catchAsync(async (req, res) => {
  const { user, tokens } = await authService.registerUser(req.body);
  
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
  
  user.password = undefined;

  sendResponse(res, 201, { user, tokens }, 'User registered successfully');
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const { user, tokens } = await authService.loginUser(email, password);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  user.password = undefined;

  sendResponse(res, 200, { user, tokens }, 'Login successful');
});

const firebaseLogin = catchAsync(async (req, res) => {
  const { idToken, deviceId, platform } = req.body;
  const result = await firebaseAuthService.authenticateWithFirebaseIdToken(
    idToken,
    { deviceId: deviceId || req.headers['x-device-id'], platform: platform || 'web' },
    res,
  );
  sendResponse(res, 200, result, 'Authentication successful');
});

const googleLogin = catchAsync(async (req, res) => {
  const { idToken, deviceId, platform } = req.body;
  const result = await firebaseAuthService.authenticateWithGoogleIdToken(
    idToken,
    { deviceId: deviceId || req.headers['x-device-id'], platform: platform || 'web' },
    res,
  );
  sendResponse(res, 200, result, 'Google authentication successful');
});

const appleLogin = catchAsync(async (req, res) => {
  const { idToken, deviceId, platform } = req.body;
  const result = await firebaseAuthService.authenticateWithAppleIdToken(
    idToken,
    { deviceId: deviceId || req.headers['x-device-id'], platform: platform || 'ios' },
    res,
  );
  sendResponse(res, 200, result, 'Apple authentication successful');
});

const devLogin = catchAsync(async (req, res) => {
  const { phone, code, deviceId, platform } = req.body;
  const result = await devAuthService.authenticateDevTestLogin(
    phone,
    code,
    { deviceId: deviceId || req.headers['x-device-id'], platform: platform || 'web' },
    res,
  );
  sendResponse(res, 200, result, 'Dev test login successful');
});

const refresh = catchAsync(async (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ status: 'fail', message: 'No refresh token provided' });
  }

  const result = await authSessionService.refreshAuthSession(
    refreshToken,
    {
      deviceId: req.body?.deviceId || req.headers['x-device-id'],
      platform: req.body?.platform,
    },
    res,
  );

  sendResponse(res, 200, result, 'Token refreshed successfully');
});

const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;
  
  if (req.user && refreshToken) {
    await authSessionService.logoutSession(req.user.id, refreshToken);
    await authService.logoutUser(req.user.accountId || req.user.id, refreshToken);
  }

  clearTokenCookies(res);
  
  sendResponse(res, 200, null, 'Logged out successfully');
});

const logoutAll = catchAsync(async (req, res) => {
  await authSessionService.logoutAllSessions(req.user.id);
  clearTokenCookies(res);
  sendResponse(res, 200, null, 'Logged out from all devices');
});

const me = catchAsync(async (req, res) => {
  const user = await authSessionService.getAuthenticatedUser(req.user.id);
  sendResponse(res, 200, { user }, 'Profile retrieved');
});

const updateProfile = catchAsync(async (req, res) => {
  const user = await authSessionService.updateUserProfile(req.user.id, req.body);
  sendResponse(res, 200, { user }, 'Profile updated');
});

const deleteAccount = catchAsync(async (req, res) => {
  await authSessionService.deleteUserAccount(req.user.id);
  clearTokenCookies(res);
  sendResponse(res, 200, null, 'Account deleted successfully');
});

const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendResponse(res, 200, null, 'If an account exists, a reset link was sent.');
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.params.token, req.body.password);
  sendResponse(res, 200, null, 'Password reset successfully');
});

const partnerLogin = catchAsync(async (req, res) => {
  const { portal, email, password } = req.body;
  const { partner, role, tokens } = await authService.loginPartner(portal, email, password);

  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  const sanitized = { ...partner };
  delete sanitized.password;

  sendResponse(res, 200, { partner: sanitized, role, tokens }, 'Partner login successful');
});

module.exports = {
  register,
  login,
  firebaseLogin,
  googleLogin,
  appleLogin,
  devLogin,
  refresh,
  logout,
  logoutAll,
  me,
  updateProfile,
  deleteAccount,
  forgotPassword,
  resetPassword,
  partnerLogin,
};
