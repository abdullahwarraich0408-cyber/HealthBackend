const Joi = require('joi');

const sendMessageSchema = Joi.object({
  message: Joi.string().trim().min(1).max(2000).required(),
});

module.exports = { sendMessageSchema };
