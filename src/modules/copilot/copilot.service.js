const copilotOrchestrator = require('../../services/copilot/CopilotOrchestrator');

async function startSession(userId) {
  return copilotOrchestrator.createSession(userId);
}

async function postMessage(userId, sessionId, text) {
  return copilotOrchestrator.sendMessage(userId, sessionId, text);
}

async function getSession(userId, sessionId) {
  return copilotOrchestrator.getSession(userId, sessionId);
}

module.exports = { startSession, postMessage, getSession };
