-- Family Health Vault migration
CREATE TABLE IF NOT EXISTS "family_health_vaults" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "name" TEXT,
    "home_address" TEXT,
    "emergency_contact" TEXT,
    "preferred_hospital" TEXT,
    "preferred_pharmacy" TEXT,
    "preferred_lab" TEXT,
    "notification_prefs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "family_health_vaults_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "family_health_vaults_admin_user_id_idx" ON "family_health_vaults"("admin_user_id");

CREATE TABLE IF NOT EXISTS "vault_family_members" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "gender" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "blood_group" TEXT,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "access_role" TEXT NOT NULL DEFAULT 'member',
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "medical_profile" JSONB,
    "emergency_profile" JSONB,
    "health_score" INTEGER,
    "avatar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vault_family_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_family_members_vault_id_idx" ON "vault_family_members"("vault_id");

CREATE TABLE IF NOT EXISTS "vault_timeline_events" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_timeline_events_member_id_event_date_idx" ON "vault_timeline_events"("member_id", "event_date");

CREATE TABLE IF NOT EXISTS "vault_medicines" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "morning" BOOLEAN NOT NULL DEFAULT false,
    "afternoon" BOOLEAN NOT NULL DEFAULT false,
    "night" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "refills_remaining" INTEGER,
    "prescribing_doctor" TEXT,
    "pharmacy" TEXT,
    "instructions" TEXT,
    "adherence_log" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vault_medicines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_medicines_member_id_idx" ON "vault_medicines"("member_id");

CREATE TABLE IF NOT EXISTS "vault_lab_reports" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "file_url" TEXT,
    "lab_name" TEXT,
    "ai_summary" TEXT,
    "extracted_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_lab_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_lab_reports_member_id_idx" ON "vault_lab_reports"("member_id");

CREATE TABLE IF NOT EXISTS "vault_vaccinations" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "dose" TEXT,
    "vaccinated_at" TIMESTAMP(3) NOT NULL,
    "hospital" TEXT,
    "next_due" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_vaccinations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_vaccinations_member_id_idx" ON "vault_vaccinations"("member_id");

CREATE TABLE IF NOT EXISTS "vault_vitals" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "vital_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_vitals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_vitals_member_id_vital_type_recorded_at_idx" ON "vault_vitals"("member_id", "vital_type", "recorded_at");

CREATE TABLE IF NOT EXISTS "vault_doctors" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "clinic" TEXT,
    "hospital" TEXT,
    "phone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "last_visit" TIMESTAMP(3),
    "next_appointment" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vault_doctors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_doctors_member_id_idx" ON "vault_doctors"("member_id");

CREATE TABLE IF NOT EXISTS "vault_appointments" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "doctor_name" TEXT NOT NULL,
    "specialty" TEXT,
    "reason" TEXT,
    "diagnosis" TEXT,
    "prescription_url" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "payment" TEXT,
    "documents" JSONB,
    "appointment_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_appointments_member_id_idx" ON "vault_appointments"("member_id");

CREATE TABLE IF NOT EXISTS "vault_prescriptions" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT,
    "ocr_data" JSONB,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_prescriptions_member_id_idx" ON "vault_prescriptions"("member_id");

ALTER TABLE "family_health_vaults" ADD CONSTRAINT "family_health_vaults_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_family_members" ADD CONSTRAINT "vault_family_members_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "family_health_vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_timeline_events" ADD CONSTRAINT "vault_timeline_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_medicines" ADD CONSTRAINT "vault_medicines_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_lab_reports" ADD CONSTRAINT "vault_lab_reports_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_vaccinations" ADD CONSTRAINT "vault_vaccinations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_vitals" ADD CONSTRAINT "vault_vitals_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_doctors" ADD CONSTRAINT "vault_doctors_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_appointments" ADD CONSTRAINT "vault_appointments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vault_prescriptions" ADD CONSTRAINT "vault_prescriptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "vault_family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
