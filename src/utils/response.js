const sendResponse = (res, statusCode, data, message = 'Success') => {
  res.status(statusCode).json({
    status: 'success',
    message,
    data
  });
};

module.exports = { sendResponse };
