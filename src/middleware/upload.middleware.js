const multer = require('multer');

// Store file in memory to pass buffer to DigitalOcean Spaces
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;
