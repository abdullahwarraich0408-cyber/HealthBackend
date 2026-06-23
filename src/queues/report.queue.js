const { Queue } = require('bullmq');
const redis = require('../config/redis');
module.exports = new Queue('reports', { connection: redis });
