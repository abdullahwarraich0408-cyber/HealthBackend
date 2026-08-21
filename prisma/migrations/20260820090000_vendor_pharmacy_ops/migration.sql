-- Pharmacy vendor operations: product catalog, inventory, batches, staff, order events.

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "iban" TEXT,
  ADD COLUMN IF NOT EXISTS "payout_schedule" TEXT DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "province" TEXT,
  ADD COLUMN IF NOT EXISTS "postal_code" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_business_name" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_name" TEXT,
  ADD COLUMN IF NOT EXISTS "business_type" TEXT,
  ADD COLUMN IF NOT EXISTS "license_expiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "min_order_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preparation_time_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "generic_name" TEXT,
  ADD COLUMN IF NOT EXISTS "brand_name" TEXT,
  ADD COLUMN IF NOT EXISTS "manufacturer" TEXT,
  ADD COLUMN IF NOT EXISTS "usage_instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "warnings" TEXT,
  ADD COLUMN IF NOT EXISTS "side_effects" TEXT,
  ADD COLUMN IF NOT EXISTS "contraindications" TEXT,
  ADD COLUMN IF NOT EXISTS "retail_price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sale_price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cost_price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "subcategory" TEXT,
  ADD COLUMN IF NOT EXISTS "dosage_form" TEXT,
  ADD COLUMN IF NOT EXISTS "strength" TEXT,
  ADD COLUMN IF NOT EXISTS "pack_size" TEXT,
  ADD COLUMN IF NOT EXISTS "sku" TEXT,
  ADD COLUMN IF NOT EXISTS "barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "prescription_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "controlled_medicine" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "listing_status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

UPDATE "products" SET "generic_name" = "formula" WHERE "generic_name" IS NULL AND "formula" IS NOT NULL;
UPDATE "products" SET "retail_price" = "price" WHERE "retail_price" IS NULL;

CREATE INDEX IF NOT EXISTS "products_vendor_id_listing_status_idx" ON "products"("vendor_id", "listing_status");
CREATE INDEX IF NOT EXISTS "products_vendor_id_sku_idx" ON "products"("vendor_id", "sku");
CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products"("barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "products_vendor_sku_unique" ON "products"("vendor_id", "sku") WHERE "sku" IS NOT NULL AND "sku" <> '';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "order_number" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "delivery_method" TEXT NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delivery_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platform_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commission_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vendor_net" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preparing_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ready_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "out_for_delivery_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rider_name" TEXT,
  ADD COLUMN IF NOT EXISTS "tracking_code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_key" ON "orders"("order_number");
CREATE INDEX IF NOT EXISTS "orders_vendor_id_status_idx" ON "orders"("vendor_id", "status");
CREATE INDEX IF NOT EXISTS "orders_vendor_id_created_at_idx" ON "orders"("vendor_id", "created_at");

ALTER TABLE "payouts"
  ADD COLUMN IF NOT EXISTS "payout_number" TEXT,
  ADD COLUMN IF NOT EXISTS "gross_amount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "net_amount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "method" TEXT,
  ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payouts_vendor_id_created_at_idx" ON "payouts"("vendor_id", "created_at");

ALTER TABLE "return_requests"
  ADD COLUMN IF NOT EXISTS "items" JSONB;

ALTER TABLE "prescription_order_items"
  ADD COLUMN IF NOT EXISTS "decision" TEXT,
  ADD COLUMN IF NOT EXISTS "matched_quantity" INTEGER;

CREATE TABLE IF NOT EXISTS "medicine_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "parent_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "medicine_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "medicine_categories_name_key" ON "medicine_categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "medicine_categories_slug_key" ON "medicine_categories"("slug");

CREATE TABLE IF NOT EXISTS "inventory" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "available_quantity" INTEGER NOT NULL DEFAULT 0,
  "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
  "sold_quantity" INTEGER NOT NULL DEFAULT 0,
  "damaged_quantity" INTEGER NOT NULL DEFAULT 0,
  "expired_quantity" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_product_id_key" ON "inventory"("product_id");
CREATE INDEX IF NOT EXISTS "inventory_vendor_id_idx" ON "inventory"("vendor_id");

CREATE TABLE IF NOT EXISTS "inventory_batches" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "batch_number" TEXT NOT NULL,
  "manufacturing_date" TIMESTAMP(3),
  "expiry_date" TIMESTAMP(3),
  "purchase_price" DOUBLE PRECISION,
  "quantity_received" INTEGER NOT NULL DEFAULT 0,
  "quantity_available" INTEGER NOT NULL DEFAULT 0,
  "supplier_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_batches_vendor_id_product_id_idx" ON "inventory_batches"("vendor_id", "product_id");
CREATE INDEX IF NOT EXISTS "inventory_batches_product_id_expiry_date_idx" ON "inventory_batches"("product_id", "expiry_date");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_batches_vendor_id_product_id_batch_number_key" ON "inventory_batches"("vendor_id", "product_id", "batch_number");

CREATE TABLE IF NOT EXISTS "inventory_transactions" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "batch_id" TEXT,
  "type" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "reason" TEXT,
  "performed_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "inventory_transactions_vendor_id_created_at_idx" ON "inventory_transactions"("vendor_id", "created_at");
CREATE INDEX IF NOT EXISTS "inventory_transactions_product_id_created_at_idx" ON "inventory_transactions"("product_id", "created_at");

CREATE TABLE IF NOT EXISTS "order_events" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "actor_id" TEXT,
  "actor_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

CREATE TABLE IF NOT EXISTS "vendor_staff" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "account_id" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "status" TEXT NOT NULL DEFAULT 'invited',
  "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_staff_account_id_key" ON "vendor_staff"("account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_staff_vendor_id_email_key" ON "vendor_staff"("vendor_id", "email");
CREATE INDEX IF NOT EXISTS "vendor_staff_vendor_id_status_idx" ON "vendor_staff"("vendor_id", "status");

CREATE TABLE IF NOT EXISTS "vendor_login_activities" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "account_id" TEXT,
  "staff_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_login_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vendor_login_activities_vendor_id_created_at_idx" ON "vendor_login_activities"("vendor_id", "created_at");

CREATE TABLE IF NOT EXISTS "prescription_reviews" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "prescription_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "decision" TEXT,
  "notes" TEXT,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prescription_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "prescription_reviews_vendor_id_status_idx" ON "prescription_reviews"("vendor_id", "status");
CREATE INDEX IF NOT EXISTS "prescription_reviews_prescription_id_idx" ON "prescription_reviews"("prescription_id");

DO $$ BEGIN
  ALTER TABLE "inventory" ADD CONSTRAINT "inventory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "vendor_login_activities" ADD CONSTRAINT "vendor_login_activities_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prescription_reviews" ADD CONSTRAINT "prescription_reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prescription_reviews" ADD CONSTRAINT "prescription_reviews_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "inventory" ("id", "vendor_id", "product_id", "available_quantity", "reserved_quantity", "sold_quantity", "damaged_quantity", "expired_quantity", "updated_at")
SELECT gen_random_uuid()::text, p.vendor_id, p.id, GREATEST(p.stock, 0), 0, 0, 0, 0, NOW()
FROM "products" p
WHERE NOT EXISTS (SELECT 1 FROM "inventory" i WHERE i.product_id = p.id);
