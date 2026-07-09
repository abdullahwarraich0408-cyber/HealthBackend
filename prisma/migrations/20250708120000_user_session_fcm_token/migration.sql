-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;
