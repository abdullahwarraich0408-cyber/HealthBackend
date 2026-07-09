const multer = require('multer');

const storage = multer.memoryStorage();

const videoUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only video files are allowed'));
  },
});

module.exports = videoUpload;
