# PharmaHub API Endpoints

This document outlines all available REST API endpoints for the PharmaHub backend. The base URL for all routes is `/api`.

---

## 🟢 System (`/api`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | API health check & uptime |

---

## 🔐 Auth (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user |
| POST | `/auth/login` | Public | Authenticate user & get tokens |
| POST | `/auth/refresh` | Public | Refresh expired access token |
| POST | `/auth/logout` | Protect | Invalidate refresh token & logout |

---

## 👤 Users (`/api/users`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users/profile` | Protect | Get current user's profile |
| PUT | `/users/profile` | Protect | Update current user's profile |
| GET | `/users` | Admin | Get all users |

---

## 📍 Saved Addresses & Notifications (`/api/addresses`, `/api/notifications`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/addresses` | Customer | Fetch current customer's saved addresses |
| POST | `/addresses` | Customer | Save a new shipping address |
| PUT | `/addresses/:id` | Customer | Edit an existing saved address by ID |
| DELETE | `/addresses/:id` | Customer | Delete a saved address by ID |
| POST | `/notifications/preferences` | Protect | Update user email/sms/push preferences |

---

## 🏪 Vendors (`/api/vendors`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/vendors` | Public | List all approved vendors |
| GET | `/vendors/:id` | Public | Get specific vendor details |
| POST | `/vendors/apply` | Protect | Apply to become a vendor |
| GET | `/vendors/profile` | Vendor | Get own vendor profile |
| PUT | `/vendors/profile` | Vendor | Update own vendor profile |
| POST | `/vendors/:id/approve` | Admin | Approve a pending vendor |

---

## 💊 Products (`/api/products`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/products` | Public | Browse/filter all products |
| GET | `/products/:id` | Public | Get single product details |
| POST | `/products` | Vendor | Create a new product listing |
| PUT | `/products/:id` | Vendor | Update product details/stock |
| DELETE | `/products/:id` | Vendor | Delete a product listing |

---

## 📦 Vendor Inventory (`/api/vendor/inventory` & `/api/vendor/products`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/vendor/inventory/bulk` | Vendor | Bulk product import via CSV file |
| PUT | `/vendor/products/:id/stock` | Vendor | Update stock quantity of a product |
| GET | `/vendor/inventory/low-stock` | Vendor | Get list of low stock products |
| POST | `/vendor/inventory/sync` | Vendor | Trigger manual inventory stock synchronization |

---

## 🛒 Cart (`/api/cart` & `/api/customer/cart`)
### General Cart
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/cart` | Customer | Get current cart state |
| POST | `/cart/items` | Customer | Add/Update item in cart |
| DELETE | `/cart/items/:productId` | Customer | Remove item from cart |

### Customer Cart (Dedicated)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/customer/cart` | Customer | Get cart items |
| POST | `/customer/cart` | Customer | Add item to cart |
| PUT | `/customer/cart/:itemId` | Customer | Update quantity |
| DELETE | `/customer/cart/:itemId` | Customer | Remove item from cart |
| POST | `/customer/cart/merge` | Customer | Merge guest cart on login |

---

## 📑 Categories (`/api/categories`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/categories` | Public | List all unique product categories |

---

## 📦 Orders (`/api/orders`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/orders` | Customer | Checkout cart and split into orders |
| GET | `/orders/my-orders` | Customer | List customer's orders |
| GET | `/orders/vendor` | Vendor | List orders belonging to vendor |
| GET | `/orders/:id` | Protect | Get specific line items & details of an order |
| PATCH| `/orders/:id/status` | Vendor | Update order status (processing, shipped) |

---

## 💳 Payments (`/api/payments`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/payments/checkout` | Customer | Generate Bank Alfalah session |
| POST | `/payments/webhook/bank-alfallah`| Public | Server-to-server webhook from bank |

---

## 💸 Payouts (`/api/payouts`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/payouts/my-payouts` | Vendor | View vendor's personal payout history |
| POST | `/payouts/trigger` | Admin | Manually trigger a payout for a vendor |

---

## 📄 Prescriptions (`/api/prescriptions` & `/api/customer/prescriptions`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/prescriptions/upload` | Customer | Upload image to DigitalOcean Spaces |
| GET | `/customer/prescriptions` | Customer | Get prescription history |
| POST | `/prescriptions/:id/validate` | Admin, Vendor | Validate prescription (approve/reject) |
| GET | `/prescriptions/pending` | Admin | Get prescriptions awaiting approval |
| PATCH| `/prescriptions/:id/verify` | Admin | Approve/Reject prescription |

---

## ⭐ Reviews (`/api/reviews`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/reviews` | Customer | Submit review for product/vendor |
| GET | `/products/:id/reviews` | Public | List reviews for a product |
| PUT | `/reviews/:id` | Customer | Update own review |
| DELETE | `/reviews/:id` | Customer | Delete own review |
| GET | `/vendors/:id/reviews` | Public | Get vendor reviews |

---

## 🔍 Search (`/api/search`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/search` | Public | Multi-search (products, vendors, categories) |
| GET | `/search/filters` | Public | Get aggregate filter options (categories, brands, price ranges) |
| POST | `/search/advanced` | Public | Advanced filter-based search with pagination & sorting |
| GET | `/search/autocomplete` | Public | Auto-suggest typeahead suggestions |
| GET | `/search/trending` | Public | Get trending search keywords from cache |

---

## 📊 Reports (`/api/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports/vendor` | Vendor | Generate self sales report |
| GET | `/reports/vendor/:vendorId` | Admin | Generate report for specific vendor |
| GET | `/reports/system` | Admin | Platform-wide revenue report |

---

## 🏷️ Coupons & Offers (`/api/coupons`, `/api/customer/coupons`, `/api/vendor/offers`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/coupons` | Admin | Create a new discount coupon |
| GET | `/coupons/:code` | Customer | Validate coupon code & check min order |
| GET | `/customer/coupons` | Customer | Get list of all applicable active coupons |
| POST | `/vendor/offers` | Vendor | Create promotional offer for owned product |

---

## 💸 Refunds & Returns (`/api/customer/returns`, `/api/admin/returns`, `/api/vendor/returns`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/customer/returns` | Customer | Submit a return/refund request for an order |
| GET | `/customer/returns` | Customer | List current customer's return requests |
| PUT | `/admin/returns/:id/status` | Admin | Approve or reject a return request |
| POST | `/vendor/returns/:id/process` | Vendor | Process refund and complete approved return |

---

## 🛠 Admin (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/dashboard` | Admin | Fetch overall platform statistics |
