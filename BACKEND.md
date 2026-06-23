# PharmaHub — Backend Architecture

## Stack Overview

| Layer | Choice |
|---|---|
| API Framework | Node.js + Express |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access + refresh) + httpOnly cookies |
| Cache | Redis |
| Search | PostgreSQL FTS → Meilisearch (multi-search) |
| Payments | Bank Alfallah + Bank Alfallah |
| File Storage | Cloudinary / AWS S3 |
| Background Jobs | BullMQ + Redis |
| Realtime | Socket.io |
| Email | Resend (primary) → Nodemailer + local SMTP (fallback) |
| SMS / OTP | Twilio (primary) → Local SMS Gateway (fallback) |

---

## Full Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
│                                                                             │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │  Customer Portal │   │  Vendor Portal  │   │  Admin Portal   │          │
│   │  Next.js 16      │   │  Next.js 16     │   │  Next.js 16     │          │
│   │  /browse /cart   │   │  /vendor/dash   │   │  /admin/dash    │          │
│   └────────┬─────────┘   └────────┬────────┘   └────────┬────────┘          │
│            │                      │                      │                  │
│            └──────────────────────┼──────────────────────┘                  │
│                      React Query (HTTP) + Socket.io (WS)                    │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                    │
│                                                                             │
│              NGINX  (reverse proxy, SSL termination, rate limit)            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NODE.JS + EXPRESS                                 │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Auth       │  │  Products   │  │  Orders     │  │  Vendors    │       │
│  │  Router     │  │  Router     │  │  Router     │  │  Router     │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                 │                 │              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Payments   │  │  Customers  │  │ Transactions│  │  Reports    │       │
│  │  Router     │  │  Router     │  │  Router     │  │  Router     │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                 │                 │              │
│         └────────────────┴─────────────────┴─────────────────┘              │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    │               │               │                       │
│             ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼──────┐              │
│             │ Middleware  │  │  Services  │  │  Socket.io  │              │
│             │ JWT Auth    │  │  Layer     │  │  Server     │              │
│             │ Role Guard  │  │  Business  │  │  (realtime) │              │
│             │ Validation  │  │  Logic     │  └─────────────┘              │
│             │ Rate Limit  │  └──────┬─────┘                               │
│             └─────────────┘         │                                      │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
              ▼                       ▼                        ▼
┌─────────────────────┐  ┌────────────────────┐  ┌────────────────────────┐
│     PRIMARY DB       │  │      CACHE         │  │     FILE STORAGE       │
│                      │  │                    │  │                        │
│   PostgreSQL         │  │   Redis            │  │   Cloudinary / S3      │
│                      │  │                    │  │                        │
│   via Prisma ORM     │  │  • Sessions        │  │  • Product images      │
│                      │  │  • Refresh tokens  │  │  • Vendor docs         │
│  Tables:             │  │  • Rate limits     │  │  • Prescriptions       │
│  ├── users           │  │  • Product cache   │  │                        │
│  ├── vendors         │  │  • Vendor cache    │  └────────────────────────┘
│  ├── products        │  │  • Search results  │
│  ├── orders          │  │  • BullMQ queues   │
│  ├── order_items     │  │                    │
│  ├── transactions    │  └────────────────────┘
│  ├── commissions     │
│  ├── payouts         │
│  ├── prescriptions   │
│  ├── reviews         │
│  └── audit_logs      │
└─────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEARCH SERVICE                                    │
│                                                                             │
│   PostgreSQL Full-Text Search  ──────────►  Meilisearch (self-hosted)      │
│   (medicines, vendors, categories)          multi-search + fast autocomplete│
│                                                                             │
│   Sync: BullMQ search-sync job fires on every product create/update/delete │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND JOBS (BullMQ + Redis)                   │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  ┌──────────┐  │
│  │ Commission     │  │ Vendor Payout  │  │ Order Timeout │  │ Reports  │  │
│  │ Calculator     │  │ Scheduler      │  │ Handler       │  │ Generator│  │
│  └────────────────┘  └────────────────┘  └───────────────┘  └──────────┘  │
│  ┌────────────────┐  ┌────────────────┐                                    │
│  │ Notification   │  │ Search Sync    │                                    │
│  │ Dispatcher     │  │ (Meilisearch)  │                                    │
│  └────────────────┘  └────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATIONS                                       │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    Notification Dispatcher (BullMQ)                 │  │
│   │   • Queued async — never blocks the request cycle                  │  │
│   │   • Retry: 3 attempts, exponential backoff                         │  │
│   │   • On final failure: logged to audit_logs + admin alert           │  │
│   └───────────────────────────┬─────────────────────────────────────────┘  │
│                               │                                             │
│               ┌───────────────┴───────────────┐                            │
│               ▼                               ▼                            │
│   ┌───────────────────────┐       ┌───────────────────────┐               │
│   │        EMAIL          │       │          SMS           │               │
│   │                       │       │                        │               │
│   │  Primary:  Resend     │       │  Primary:  Twilio      │               │
│   │  Fallback: Nodemailer │       │  Fallback: Local SMS   │               │
│   │            + local    │       │            Gateway     │               │
│   │            SMTP       │       │            (e.g. Zong/ │               │
│   │                       │       │            Jazz HTTP)  │               │
│   │  Templates (stored    │       │                        │               │
│   │  in /templates/email):│       │  • OTP verification    │               │
│   │  • order-confirmed    │       │  • Order status        │               │
│   │  • payout-processed   │       │  • Delivery updates    │               │
│   │  • low-stock-alert    │       │                        │               │
│   │  • prescription-ready │       └───────────────────────┘               │
│   │  • vendor-approved    │                                                │
│   └───────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENTS                                            │
│                                                                             │
│        Bank Alfallah API  ◄──────► Express Router ◄──────► Bank Alfallah API        │
│        (webhook)                                       (webhook)            │
│                  └──────────────────────────────┘                          │
│                          PostgreSQL transactions table                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT (Railway / Render / AWS)                 │
│                                                                             │
│   GitHub Push                                                               │
│       │                                                                     │
│       ▼                                                                     │
│   GitHub Actions CI  ──► Build & Test  ──► Deploy                          │
│   (.github/workflows)                       │                              │
│                                             ├── Express API server         │
│                                             ├── PostgreSQL (managed)       │
│                                             ├── Redis (managed)            │
│                                             └── Next.js (Vercel / same)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

1. Browser hits **NGINX** → forwarded to Express
2. Middleware chain: rate limit → JWT verify (access token) → role guard → validation
3. Route handler calls **service layer** (business logic)
4. Service checks **Redis cache** first → on miss, queries **PostgreSQL** via Prisma
5. File ops go to **Cloudinary/S3**, search goes to **Meilisearch** (multi-search)
6. Heavy tasks (commissions, payouts, notifications, search sync) pushed to **BullMQ** queue
7. Realtime events (order status change) emitted via **Socket.io** back to client
8. Notifications dispatched async via **Notification Dispatcher** (Resend/Twilio with local fallback)

---

## Auth — JWT + Refresh Token Rotation

Three roles, three separate JWT scopes:

```
customer  →  /api/customer/*
vendor    →  /api/vendor/*
admin     →  /api/admin/*
```

### Token Strategy

| Token | TTL | Storage | Purpose |
|---|---|---|---|
| Access Token | 15 minutes | httpOnly cookie | Authorizes API requests |
| Refresh Token | 7 days | httpOnly cookie + Redis | Issues new access token |

### Refresh Token Rotation

```
1. Client makes request → access token expired (401)
2. Client hits POST /api/auth/refresh
3. Server reads refresh token from httpOnly cookie
4. Server checks refresh token exists in Redis (not revoked)
5. Server issues NEW access token + NEW refresh token
6. Old refresh token deleted from Redis (one-time use)
7. New refresh token stored in Redis with TTL
8. Both new tokens sent as httpOnly cookies
```

On logout or suspicious reuse (token already deleted), all refresh tokens for that user are purged from Redis.

---

## Multi-Vendor Cart & Order Splitting

A cart can contain products from multiple vendors. At checkout the system splits the cart into one order per vendor.

### Checkout Flow

```
Customer submits cart
        │
        ▼
Checkout Service groups cart items by vendor_id
        │
        ├── Vendor A items  →  ORDER-001 (vendor_id: A)
        ├── Vendor B items  →  ORDER-002 (vendor_id: B)
        └── Vendor C items  →  ORDER-003 (vendor_id: C)
        │
        ▼
Single payment transaction created (total of all orders)
        │
        ▼
transactions table links to all order IDs via order_transactions join
        │
        ▼
Commission calculated per order → commissions table
        │
        ▼
Notifications sent per vendor (new order alert via Socket.io + SMS)
```

### Schema

**`orders`** — one row per vendor per checkout session
```
id | customer_id | vendor_id | checkout_session_id | total_amount | status | delivery_address | created_at
```

**`order_items`** — one row per product inside that order
```
id | order_id | product_id | quantity | unit_price
```

**`order_transactions`** — links payment to one or more orders (multi-vendor)
```
id | transaction_id | order_id
```

---

## Database Tables

### All Tables

| Table | Purpose |
|---|---|
| `users` | Customers — auth credentials, profile, addresses |
| `vendors` | Pharmacy accounts — name, license, status, commission rate |
| `products` | Medicine listings — name, formula, price, stock, vendor_id |
| `orders` | Order header — customer, vendor, checkout_session_id, total, status, address |
| `order_items` | Line items per order — product, qty, unit price |
| `order_transactions` | Join table — links a transaction to one or more orders |
| `transactions` | Payment records — amount, type, gateway reference |
| `commissions` | Platform cut per order — calculated from vendor rate |
| `payouts` | Vendor payout records — amount, status, payout date, reference |
| `prescriptions` | Uploaded prescription files — storage URL, order_id, status, verified_by |
| `reviews` | Customer ratings on products |
| `audit_logs` | Admin trail — who did what and when |

### Key Table Schemas

**`payouts`**
```
id | vendor_id | amount | status (pending/processing/completed/failed) | payout_date | gateway_reference | created_at
```

**`prescriptions`**
```
id | customer_id | order_id | product_id | file_url | status (pending/verified/rejected) | verified_by | notes | created_at
```

**`orders`** (updated)
```
id | customer_id | vendor_id | checkout_session_id | total_amount | status | requires_prescription | delivery_address | created_at
```

---

## Search Service

### Architecture

PostgreSQL FTS handles all searches at low-to-medium scale. Meilisearch is layered on top for fast autocomplete and advanced filtering.

### Meilisearch Sync

Every product create/update/delete triggers a **BullMQ search-sync job** via a Prisma middleware hook:

```
Prisma middleware intercepts product write
        │
        ▼
Pushes job to BullMQ search-sync queue
        │
        ▼
Worker picks up job → calls Meilisearch API
        │
        ├── create/update  →  index document
        └── delete         →  delete document from index
```

### Multi-Search

Meilisearch `/multi-search` endpoint allows batching multiple queries in a single HTTP request:

```js
// Example: search products + vendors simultaneously
POST /multi-search
{
  queries: [
    { indexUid: "products", q: "panadol", limit: 10 },
    { indexUid: "vendors",  q: "city pharmacy", limit: 5 }
  ]
}
```

Used on the browse page to return product results and vendor results in one round trip.

---

## Notification System

### Architecture

All notifications are **queued via BullMQ** — never blocking the request cycle.

```
Service layer pushes notification job
        │
        ▼
BullMQ notification queue
        │
        ▼
Notification Dispatcher Worker
        │
        ├── type: email  →  Email Provider Chain
        └── type: sms    →  SMS Provider Chain
```

### Email Provider Chain

```
Try Resend API
    │
    ├── Success  →  mark delivered, log
    └── Failure  →  retry (exponential backoff, max 3 attempts)
                        │
                        └── Still failing  →  fallback to Nodemailer + local SMTP
                                                    │
                                                    ├── Success  →  log (fallback used)
                                                    └── Failure  →  log to audit_logs
                                                                     + fire admin alert
```

### SMS Provider Chain

```
Try Twilio API
    │
    ├── Success  →  mark delivered, log
    └── Failure  →  retry (exponential backoff, max 3 attempts)
                        │
                        └── Still failing  →  fallback to Local SMS Gateway
                                              (Jazz/Zong/Telenor HTTP API)
                                                    │
                                                    ├── Success  →  log (fallback used)
                                                    └── Failure  →  log to audit_logs
                                                                     + fire admin alert
```

### Email Templates

Stored in `/templates/email/` as HTML with variable slots:

| Template | Trigger |
|---|---|
| `order-confirmed.html` | Order placed successfully |
| `order-status-update.html` | Status changes (processing/shipped/delivered) |
| `payout-processed.html` | Vendor payout completed |
| `low-stock-alert.html` | Product stock below threshold |
| `prescription-ready.html` | Prescription verified by admin |
| `vendor-approved.html` | Vendor account approved |
| `otp.html` | OTP for account actions |

### Notification Events Map

| Event | Email | SMS | Socket.io |
|---|---|---|---|
| Order placed | ✓ customer | ✓ customer | ✓ vendor (new order alert) |
| Order status change | ✓ customer | ✓ customer | ✓ customer (live status) |
| Prescription verified | ✓ customer | — | — |
| Payout processed | ✓ vendor | — | — |
| Low stock | ✓ vendor | — | ✓ vendor (KPI card) |
| Vendor approved | ✓ vendor | ✓ vendor | — |
| OTP | — | ✓ customer/vendor | — |

---

## Why Socket.io

Three specific use cases:

1. **Order status updates** — customer sees `Pending → Processing → Shipped → Delivered` live without refreshing
2. **Vendor notifications** — vendor gets instant alert when a new order comes in
3. **Low stock alerts** — vendor dashboard KPI card updates in real time

---

## Background Jobs Summary

| Job | Trigger | Queue |
|---|---|---|
| Commission Calculator | Order status → paid | `commissions` |
| Vendor Payout Scheduler | Cron (weekly/monthly) | `payouts` |
| Order Timeout Handler | BullMQ delayed job on order create | `orders` |
| Reports Generator | Cron / admin request | `reports` |
| Notification Dispatcher | Any notification event | `notifications` |
| Search Sync | Product create/update/delete (Prisma hook) | `search-sync` |

---

## Deployment

```
GitHub Push
    │
    ▼
GitHub Actions CI  ──► Build & Test  ──► Deploy
(.github/workflows)                       │
                                          ├── Express API server
                                          ├── PostgreSQL (managed)
                                          ├── Redis (managed)
                                          ├── Meilisearch (self-hosted container)
                                          └── Next.js (Vercel / same platform)
```
