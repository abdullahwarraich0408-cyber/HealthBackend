const AppError = require('../utils/AppError');

const validate = (schema) => (req, res, next) => {
  try {
    const bodySchema = schema.shape?.body ?? schema.body;
    const querySchema = schema.shape?.query ?? schema.query;
    const paramsSchema = schema.shape?.params ?? schema.params;

    if (bodySchema) {
      req.body = bodySchema.parse(req.body);
    }
    if (querySchema) {
      req.query = querySchema.parse(req.query);
    }
    if (paramsSchema) {
      req.params = paramsSchema.parse(req.params);
    }
    next();
  } catch (error) {
    const messages = error.errors?.map((err) => err.message).join(', ');
    next(new AppError(`Validation Error: ${messages}`, 400));
  }
};

module.exports = { validate };
