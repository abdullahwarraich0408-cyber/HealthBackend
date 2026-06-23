module.exports = {
  apps: [
    {
      name: 'pharmahub-api',
      script: 'src/server.js',
      instances: 1,              // Single instance for 1GB RAM
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      max_memory_restart: '600M', // Restart if memory exceeds 600MB
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/pharmahub-error.log',
      out_file: '/var/log/pm2/pharmahub-out.log',
      merge_logs: true,
    },
  ],
};
