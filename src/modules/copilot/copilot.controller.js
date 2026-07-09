const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const copilotService = require('./copilot.service');

const createSession = catchAsync(async (req, res) => {
  const result = await copilotService.startSession(req.user.id);
  sendResponse(res, 201, result, 'Copilot session started');
});

const sendMessage = catchAsync(async (req, res) => {
  const result = await copilotService.postMessage(
    req.user.id,
    req.params.sessionId,
    req.body.message,
  );
  sendResponse(res, 200, result, 'Message processed');
});

const getSession = catchAsync(async (req, res) => {
  const result = await copilotService.getSession(req.user.id, req.params.sessionId);
  if (!result) {
    return sendResponse(res, 404, null, 'Session not found');
  }
  sendResponse(res, 200, result, 'Session fetched');
});

module.exports = { createSession, sendMessage, getSession };
