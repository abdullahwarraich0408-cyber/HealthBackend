-- PharmaHub Firebase Auth Migration
-- Run: npx prisma migrate dev --name firebase_auth

-- Extend users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firebase_uid" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "membership_status" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "membership_expiry" TIMESTAMP(3);

-- Make name optional default for auto-created Firebase users
ALTER TABLE "users" ALTER COLUMN "name" SET DEFAULT '';

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- Make account password optional for Firebase-only users
ALTER TABLE "accounts" ALTER COLUMN "password" DROP NOT NULL;

-- User sessions (refresh token rotation + device tracking)
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_refresh_token_key" ON "user_sessions"("refresh_token");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_device_id_idx" ON "user_sessions"("device_id");

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Family profiles
CREATE TABLE IF NOT EXISTS "family_profiles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "gender" TEXT,
  "date_of_birth" TIMESTAMP(3),
  "blood_group" TEXT,
  "medical_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "family_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "family_profiles_user_id_idx" ON "family_profiles"("user_id");

ALTER TABLE "family_profiles" ADD CONSTRAINT "family_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Memberships
CREATE TABLE IF NOT EXISTS "memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "end_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships"("user_id");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
