const AppError = require('../utils/AppError');
// Basic rate limit mock
const rateLimiter = (req, res, next) => {
  next();
};

module.exports = { rateLimiter };
