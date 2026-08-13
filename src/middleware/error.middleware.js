const { logger } = require('../utils/logger');

function isPrismaError(err) {
  return Boolean(
    err?.name?.startsWith?.('Prisma') ||
      err?.clientVersion ||
      err?.code?.startsWith?.('P') ||
      /prisma\.|Invalid `prisma/i.test(err?.message || ''),
  );
}

function clientMessage(err) {
  if (err.isOperational) return err.message;
  if (isPrismaError(err)) {
    if (/does not exist on the database server/i.test(err.message || '')) {
      return 'Database is not ready. Please try again in a moment.';
    }
    return 'A database error occurred. Please try again.';
  }
  if (process.env.NODE_ENV === 'development') return err.message;
  return 'Something went very wrong!';
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  logger.error(
    `${err.status} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}${
      process.env.NODE_ENV === 'development' && err.stack ? ` - ${err.stack}` : ''
    }`,
  );

  const payload = {
    status: err.status,
    message: clientMessage(err),
  };

  // Keep stack/details in logs only — never ship Prisma dumps to the browser
  if (process.env.NODE_ENV === 'development' && err.isOperational) {
    payload.error = { statusCode: err.statusCode, isOperational: true };
  }

  res.status(err.statusCode).json(payload);
};

module.exports = { errorHandler };
