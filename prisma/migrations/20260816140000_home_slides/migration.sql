-- Home posters: 4 first-visit cards + 4 returning-user offer cards

CREATE TABLE "home_slides" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "image_url" TEXT NOT NULL DEFAULT '',
    "bg" TEXT NOT NULL DEFAULT '#17618E',
    "label" TEXT,
    "description" TEXT,
    "badge" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_slides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "home_slides_audience_slot_key" ON "home_slides"("audience", "slot");
CREATE INDEX "home_slides_audience_is_active_idx" ON "home_slides"("audience", "is_active");

INSERT INTO "home_slides" ("id", "audience", "slot", "title", "cta", "action", "bg", "label", "description", "badge")
VALUES
  ('home-first-1', 'first_visit', 1, 'Upload a prescription, get your medicines', 'Upload Prescription', 'prescription', '#156A96', 'Easy Medicine Ordering', 'Have a prescription? Upload it securely and continue your medicine order.', NULL),
  ('home-first-2', 'first_visit', 2, 'Consult a doctor from wherever you are', 'Find a Doctor', 'doctors', '#0E7A72', 'Doctor Consultations', 'Book an online or in-clinic consultation with healthcare professionals.', NULL),
  ('home-first-3', 'first_visit', 3, 'Find and order the medicines you need', 'Shop Medicines', 'pharmacy', '#124362', 'Online Pharmacy', 'Search medicines and healthcare products from pharmacies on Medzoos.', NULL),
  ('home-first-4', 'first_visit', 4, 'Book lab tests with home sampling', 'Book a Lab Test', 'labs', '#1A7A88', 'Diagnostic Services', 'Find diagnostic tests and request home sample collection where available.', 'Home Sampling Available'),
  ('home-offer-1', 'returning', 1, 'Flat 25% off on medicines', 'Shop now', 'pharmacy', '#156A96', 'Limited offer', 'Save on medicines from pharmacies on Medzoos.', '25% OFF'),
  ('home-offer-2', 'returning', 2, 'First consult from the comfort of home', 'Book now', 'doctors', '#0E7A72', 'Doctor offer', 'Book an online consultation with a Medzoos doctor.', NULL),
  ('home-offer-3', 'returning', 3, 'Lab tests with home sampling', 'Book test', 'labs', '#1A7A88', 'Lab offer', 'Book diagnostic tests with home sample collection.', 'Home sampling'),
  ('home-offer-4', 'returning', 4, 'Hospital care, booked in minutes', 'Find hospitals', 'hospitals', '#124362', 'Hospital offer', 'Book visits at leading hospitals on Medzoos.', NULL);
