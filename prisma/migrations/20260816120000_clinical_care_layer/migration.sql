-- Clinical care layer: doctor-patient relationship, consultation, sharing, documents

CREATE TABLE "doctor_patient_relationships" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "first_consultation" TIMESTAMP(3),
    "last_consultation" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "total_consultations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_patient_relationships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doctor_patient_relationships_doctor_id_patient_id_key" ON "doctor_patient_relationships"("doctor_id", "patient_id");
CREATE INDEX "doctor_patient_relationships_patient_id_idx" ON "doctor_patient_relationships"("patient_id");

CREATE TABLE "consultations" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "symptoms" TEXT,
    "diagnosis" TEXT,
    "clinical_notes" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "follow_up_notes" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consultations_appointment_id_key" ON "consultations"("appointment_id");
CREATE INDEX "consultations_doctor_id_patient_id_idx" ON "consultations"("doctor_id", "patient_id");
CREATE INDEX "consultations_relationship_id_idx" ON "consultations"("relationship_id");

CREATE TABLE "record_shares" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "share_prescriptions" BOOLEAN NOT NULL DEFAULT true,
    "share_lab_reports" BOOLEAN NOT NULL DEFAULT true,
    "share_medicines" BOOLEAN NOT NULL DEFAULT true,
    "share_documents" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "record_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "record_shares_appointment_id_key" ON "record_shares"("appointment_id");
CREATE INDEX "record_shares_doctor_id_patient_id_idx" ON "record_shares"("doctor_id", "patient_id");

CREATE TABLE "medical_documents" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'patient_upload',
    "title" TEXT NOT NULL,
    "doctor_name" TEXT,
    "hospital_name" TEXT,
    "document_date" TIMESTAMP(3),
    "file_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "medical_documents_patient_id_document_type_idx" ON "medical_documents"("patient_id", "document_type");

ALTER TABLE "doctor_appointments" ADD COLUMN "relationship_id" TEXT;
CREATE INDEX "doctor_appointments_relationship_id_idx" ON "doctor_appointments"("relationship_id");

ALTER TABLE "doctor_prescriptions" ADD COLUMN "consultation_id" TEXT;
ALTER TABLE "doctor_prescriptions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'signed';
ALTER TABLE "doctor_prescriptions" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'doctor_issued';
ALTER TABLE "doctor_prescriptions" ADD COLUMN "signed_at" TIMESTAMP(3);
CREATE INDEX "doctor_prescriptions_doctor_id_customer_id_idx" ON "doctor_prescriptions"("doctor_id", "customer_id");

ALTER TABLE "lab_test_bookings" ADD COLUMN "doctor_id" TEXT;
ALTER TABLE "lab_test_bookings" ADD COLUMN "appointment_id" TEXT;
ALTER TABLE "lab_test_bookings" ADD COLUMN "consultation_id" TEXT;
ALTER TABLE "lab_test_bookings" ADD COLUMN "ordered_by_doctor" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "lab_test_bookings_doctor_id_idx" ON "lab_test_bookings"("doctor_id");
CREATE INDEX "lab_test_bookings_appointment_id_idx" ON "lab_test_bookings"("appointment_id");

ALTER TABLE "doctor_patient_relationships"
  ADD CONSTRAINT "doctor_patient_relationships_doctor_id_fkey"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_patient_relationships"
  ADD CONSTRAINT "doctor_patient_relationships_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "doctor_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_relationship_id_fkey"
  FOREIGN KEY ("relationship_id") REFERENCES "doctor_patient_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_doctor_id_fkey"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "record_shares"
  ADD CONSTRAINT "record_shares_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "doctor_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "record_shares"
  ADD CONSTRAINT "record_shares_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "medical_documents"
  ADD CONSTRAINT "medical_documents_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "doctor_appointments"
  ADD CONSTRAINT "doctor_appointments_relationship_id_fkey"
  FOREIGN KEY ("relationship_id") REFERENCES "doctor_patient_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "doctor_prescriptions"
  ADD CONSTRAINT "doctor_prescriptions_consultation_id_fkey"
  FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doctor_prescriptions"
  ADD CONSTRAINT "doctor_prescriptions_doctor_id_fkey"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_prescriptions"
  ADD CONSTRAINT "doctor_prescriptions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lab_test_bookings"
  ADD CONSTRAINT "lab_test_bookings_doctor_id_fkey"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_test_bookings"
  ADD CONSTRAINT "lab_test_bookings_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "doctor_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_test_bookings"
  ADD CONSTRAINT "lab_test_bookings_consultation_id_fkey"
  FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
