const { logger } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    logger.error(`${err.status} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip} - ${err.stack}`);
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    logger.error(`${err.status} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      // Programming or other unknown error: don't leak error details
      res.status(500).json({
        status: 'error',
        message: 'Something went very wrong!'
      });
    }
  }
};

module.exports = { errorHandler };
