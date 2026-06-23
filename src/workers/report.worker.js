const { Worker } = require('bullmq');
const redis = require('../config/redis');
const { generateAdminSystemReport } = require('../modules/reports/reports.service');
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const reportWorker = new Worker('reports', async (job) => {
  logger.info(`Processing report generation job ${job.id}`);
  
  if (job.name === 'generate-monthly-report') {
    const reportData = await generateAdminSystemReport();
    
    // Save report to disk or upload to S3
    const reportPath = path.join(__dirname, `../../reports/monthly-${job.data.month}-${new Date().getFullYear()}.json`);
    
    // Ensure dir exists
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    
    logger.info(`Monthly report generated and saved at ${reportPath}`);
  }
}, { connection: redis });

module.exports = reportWorker;
