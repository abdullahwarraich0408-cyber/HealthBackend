const jwt = require('jsonwebtoken');
const env = require('../../config/env');

const socketAuth = (socket, next) => {
  // Handshake auth usually comes in headers or query
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    socket.user = decoded; // Attach user info to socket
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
};

module.exports = socketAuth;
