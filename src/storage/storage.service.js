const doSpacesProvider = require('./providers/s3.provider');
// const cloudinaryProvider = require('./providers/cloudinary.provider');

const uploadFile = async (fileBuffer, originalName, folder = 'general', mimetype = 'application/octet-stream') => {
  // We are using DigitalOcean Spaces as configured
  const fileUrl = await doSpacesProvider.uploadFile(fileBuffer, originalName, folder, mimetype);
  return fileUrl;
};

module.exports = {
  uploadFile
};
