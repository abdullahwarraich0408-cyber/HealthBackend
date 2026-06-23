const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

// DigitalOcean Spaces uses the S3 protocol
const s3Client = new S3Client({
  endpoint: env.DO_SPACES_ENDPOINT, // e.g., "https://nyc3.digitaloceanspaces.com"
  region: env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: env.DO_SPACES_KEY,
    secretAccessKey: env.DO_SPACES_SECRET
  }
});

module.exports = s3Client;
