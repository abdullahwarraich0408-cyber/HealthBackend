const cloudinary = require('cloudinary').v2;
const env = require('../../config/env');

cloudinary.config({
  cloudinary_url: env.CLOUDINARY_URL
});

module.exports = cloudinary;
