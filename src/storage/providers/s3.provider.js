const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../../config/s3');
const env = require('../../config/env');
const { BUCKET_NAME } = require('../storage.constants');
const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const uploadFile = async (fileBuffer, fileName, folder = 'general', mimetype) => {
  const fileKey = `${folder}/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: env.DO_SPACES_BUCKET || BUCKET_NAME,
    Key: fileKey,
    Body: fileBuffer,
    ContentType: mimetype,
    ACL: 'public-read' // DigitalOcean specific permission
  });

  try {
    await s3Client.send(command);
    // DigitalOcean Space public URL format
    const url = `${env.DO_SPACES_ENDPOINT.replace('https://', `https://${env.DO_SPACES_BUCKET}.`)}/${fileKey}`;
    logger.info(`File uploaded to DigitalOcean Spaces: ${url}`);
    return url;
  } catch (error) {
    logger.warn(`DO Spaces upload failed: ${error.message}. Falling back to local storage.`);
    try {
      // Local fallback logic
      const localFolder = path.join(__dirname, '../../../public/uploads', folder);
      if (!fs.existsSync(localFolder)) {
        fs.mkdirSync(localFolder, { recursive: true });
      }
      
      const sanitizedFileName = (fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
      const localFileName = `${Date.now()}-${sanitizedFileName}`;
      const localFilePath = path.join(localFolder, localFileName);
      
      fs.writeFileSync(localFilePath, fileBuffer);
      
      const serverPort = env.PORT || 5000;
      const url = `http://localhost:${serverPort}/uploads/${folder}/${localFileName}`;
      logger.info(`File uploaded to Local fallback: ${url}`);
      return url;
    } catch (localError) {
      logger.error(`Local fallback upload failed: ${localError.message}`);
      throw error; // Throw original DO Spaces error if fallback also fails
    }
  }
};

const deleteFile = async (fileKey) => {
  const command = new DeleteObjectCommand({
    Bucket: env.DO_SPACES_BUCKET || BUCKET_NAME,
    Key: fileKey
  });

  try {
    await s3Client.send(command);
    logger.info(`File deleted from DO Spaces: ${fileKey}`);
  } catch (error) {
    logger.warn(`DO Spaces delete failed: ${error.message}. Checking local storage.`);
    try {
      const localFilePath = path.join(__dirname, '../../../public/uploads', fileKey);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        logger.info(`File deleted from local storage: ${fileKey}`);
      }
    } catch (localError) {
      logger.error(`Local file delete failed: ${localError.message}`);
      throw error;
    }
  }
};

module.exports = {
  uploadFile,
  deleteFile
};
