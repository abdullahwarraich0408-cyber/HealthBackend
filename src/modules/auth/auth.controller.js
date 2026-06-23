const catchAsync = require('../../utils/catchAsync');
const authService = require('./auth.service');
const { sendResponse } = require('../../utils/response');
const { setTokenCookies, clearTokenCookies } = require('./auth.helper');

const register = catchAsync(async (req, res) => {
  const { user, tokens } = await authService.registerUser(req.body);
  
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
  
  // Remove password from output
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

const refresh = catchAsync(async (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ status: 'fail', message: 'No refresh token provided' });
  }

  const tokens = await authService.refreshAuthToken(refreshToken);
  
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  sendResponse(res, 200, { tokens }, 'Token refreshed successfully');
});

const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (req.user && refreshToken) {
    await authService.logoutUser(req.user.id, refreshToken);
  }

  clearTokenCookies(res);
  
  sendResponse(res, 200, null, 'Logged out successfully');
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
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  partnerLogin,
};
