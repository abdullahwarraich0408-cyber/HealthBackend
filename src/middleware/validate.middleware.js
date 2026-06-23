const AppError = require('../utils/AppError');

const validate = (schema) => (req, res, next) => {
  try {
    if (schema.body) {
      req.body = schema.body.parse(req.body);
    }
    if (schema.query) {
      req.query = schema.query.parse(req.query);
    }
    if (schema.params) {
      req.params = schema.params.parse(req.params);
    }
    next();
  } catch (error) {
    const messages = error.errors?.map((err) => err.message).join(', ');
    next(new AppError(`Validation Error: ${messages}`, 400));
  }
};

module.exports = { validate };
