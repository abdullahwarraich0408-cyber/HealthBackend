# Medzoos — Backend File Structure

```
medzoos-backend/
│
├── src/
│   │
│   ├── config/                          # All configuration, env, third-party setup
│   │   ├── index.js                     # Exports all config in one place
│   │   ├── database.js                  # Prisma client instance
│   │   ├── redis.js                     # Redis client instance
│   │   ├── s3.js                        # AWS S3 / Cloudinary client
│   │   ├── meilisearch.js               # Meilisearch client instance
│   │   ├── socket.js                    # Socket.io server setup
│   │   └── env.js                       # Zod-validated env variables
│   │
│   ├── modules/                         # Feature modules — one folder per domain
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js          # login, register, refresh, logout
│   │   │   ├── auth.validator.js        # Joi/Zod request schemas
│   │   │   └── auth.helper.js           # token generation, hashing
│   │   │
│   │   ├── users/
│   │   │   ├── users.routes.js
│   │   │   ├── users.controller.js
│   │   │   ├── users.service.js
│   │   │   └── users.validator.js
│   │   │
│   │   ├── vendors/
│   │   │   ├── vendors.routes.js
│   │   │   ├── vendors.controller.js
│   │   │   ├── vendors.service.js
│   │   │   └── vendors.validator.js
│   │   │
│   │   ├── products/
│   │   │   ├── products.routes.js
│   │   │   ├── products.controller.js
│   │   │   ├── products.service.js
│   │   │   └── products.validator.js
│   │   │
│   │   ├── orders/
│   │   │   ├── orders.routes.js
│   │   │   ├── orders.controller.js
│   │   │   ├── orders.service.js        # includes order splitting logic
│   │   │   └── orders.validator.js
│   │   │
│   │   ├── cart/
│   │   │   ├── cart.routes.js
│   │   │   ├── cart.controller.js
│   │   │   ├── cart.service.js
│   │   │   └── cart.validator.js
│   │   │
│   │   ├── payments/
│   │   │   ├── payments.routes.js
│   │   │   ├── payments.controller.js
│   │   │   ├── payments.service.js
│   │   │   ├── payments.validator.js
│   │   │   ├── gateways/
│   │   │   │   ├── jazzcash.js
│   │   │   │   └── easypaisa.js
│   │   │   └── webhooks/
│   │   │       ├── jazzcash.webhook.js
│   │   │       └── easypaisa.webhook.js
│   │   │
│   │   ├── prescriptions/
│   │   │   ├── prescriptions.routes.js
│   │   │   ├── prescriptions.controller.js
│   │   │   ├── prescriptions.service.js
│   │   │   └── prescriptions.validator.js
│   │   │
│   │   ├── reviews/
│   │   │   ├── reviews.routes.js
│   │   │   ├── reviews.controller.js
│   │   │   ├── reviews.service.js
│   │   │   └── reviews.validator.js
│   │   │
│   │   ├── search/
│   │   │   ├── search.routes.js
│   │   │   ├── search.controller.js
│   │   │   └── search.service.js        # multi-search, FTS fallback logic
│   │   │
│   │   ├── reports/
│   │   │   ├── reports.routes.js
│   │   │   ├── reports.controller.js
│   │   │   └── reports.service.js
│   │   │
│   │   └── admin/
│   │       ├── admin.routes.js
│   │       ├── admin.controller.js
│   │       └── admin.service.js
│   │
│   ├── queues/                          # BullMQ — all queue definitions
│   │   ├── index.js                     # Exports all queues
│   │   ├── notification.queue.js
│   │   ├── order.queue.js
│   │   ├── payment.queue.js
│   │   ├── payout.queue.js
│   │   ├── commission.queue.js
│   │   ├── report.queue.js
│   │   └── search-sync.queue.js
│   │
│   ├── workers/                         # BullMQ — all worker processors
│   │   ├── index.js                     # Boots all workers
│   │   ├── notification.worker.js
│   │   ├── order-timeout.worker.js
│   │   ├── payout.worker.js
│   │   ├── commission.worker.js
│   │   ├── report.worker.js
│   │   └── search-sync.worker.js
│   │
│   ├── jobs/                            # node-cron scheduled jobs
│   │   ├── index.js                     # Registers all cron jobs
│   │   ├── payout-scheduler.job.js      # Weekly/monthly vendor payouts
│   │   ├── report-generator.job.js      # Scheduled report exports
│   │   └── stock-checker.job.js         # Periodic low-stock scan
│   │
│   ├── notifications/                   # Notification system
│   │   ├── dispatcher.js                # Routes to email or SMS + fallback logic
│   │   ├── email/
│   │   │   ├── email.service.js         # Resend → Nodemailer fallback chain
│   │   │   ├── providers/
│   │   │   │   ├── resend.js
│   │   │   │   └── nodemailer.js        # local SMTP fallback
│   │   │   └── templates/
│   │   │       ├── order-confirmed.html
│   │   │       ├── order-status-update.html
│   │   │       ├── payout-processed.html
│   │   │       ├── low-stock-alert.html
│   │   │       ├── prescription-ready.html
│   │   │       ├── vendor-approved.html
│   │   │       └── otp.html
│   │   └── sms/
│   │       ├── sms.service.js           # Twilio → local gateway fallback chain
│   │       └── providers/
│   │           ├── twilio.js
│   │           └── local-gateway.js     # Jazz/Zong/Telenor HTTP API
│   │
│   ├── middleware/                      # Express middleware
│   │   ├── auth.middleware.js           # JWT verify + attach user to req
│   │   ├── role.middleware.js           # Role guard (customer/vendor/admin)
│   │   ├── validate.middleware.js       # Request body/query validation
│   │   ├── rateLimit.middleware.js      # Redis-backed rate limiting
│   │   ├── upload.middleware.js         # Multer config for file uploads
│   │   └── error.middleware.js          # Global error handler
│   │
│   ├── utils/                           # Shared pure utilities
│   │   ├── response.js                  # Standardized API response helper
│   │   ├── pagination.js                # Cursor / offset pagination helpers
│   │   ├── logger.js                    # Winston logger setup
│   │   ├── catchAsync.js                # Wraps async controllers (no try/catch)
│   │   ├── AppError.js                  # Custom error class
│   │   ├── generateInvoice.js           # PDF invoice generator
│   │   └── dateHelpers.js
│   │
│   ├── storage/                         # File storage abstraction
│   │   ├── storage.service.js           # Single interface (S3 or Cloudinary)
│   │   ├── providers/
│   │   │   ├── s3.provider.js
│   │   │   └── cloudinary.provider.js
│   │   └── storage.constants.js         # Bucket names, folder paths, allowed types
│   │
│   ├── sockets/                         # Socket.io event handlers
│   │   ├── index.js                     # Registers all socket namespaces
│   │   ├── order.socket.js              # Order status live updates
│   │   ├── vendor.socket.js             # New order / low stock alerts
│   │   └── middleware/
│   │       └── socketAuth.js            # JWT verify for WS connections
│   │
│   ├── prisma/                          # Prisma hooks and extensions
│   │   └── middleware.js                # Search sync hook on product writes
│   │
│   ├── routes/                          # Top-level route registrar
│   │   └── index.js                     # Mounts all module routers
│   │
│   ├── app.js                           # Express app setup (middleware, routes)
│   └── server.js                        # Entry point — starts server, workers, crons
│
├── prisma/
│   ├── schema.prisma                    # Full DB schema
│   ├── seed.js                          # Dev seed data
│   └── migrations/                      # Prisma migration files
│
├── tests/
│   ├── unit/
│   │   └── modules/                     # Unit tests mirroring src/modules
│   ├── integration/
│   │   └── modules/
│   └── setup.js
│
├── .github/
│   └── workflows/
│       └── ci.yml                       # GitHub Actions CI pipeline
│
├── .env
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── package.json
└── README.md
```
