-- CMS for app and website content that admins can update later

CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'both',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT NOT NULL DEFAULT '',
    "bg" TEXT NOT NULL DEFAULT '',
    "badge" TEXT NOT NULL DEFAULT '',
    "meta" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_items_section_channel_is_active_idx" ON "content_items"("section", "channel", "is_active");

CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "content_items" ("id", "section", "channel", "sort_order", "title", "subtitle", "icon", "action", "href", "meta")
VALUES
  ('care-1', 'care_actions', 'app', 1, 'Find doctor', 'Online consult', 'stethoscope', 'doctors', '/doctors', ''),
  ('care-2', 'care_actions', 'app', 2, 'Clinic visit', 'Book in person', 'hospital-building', 'clinic', '/doctors?consult=in_person', ''),
  ('care-3', 'care_actions', 'app', 3, 'Order medicines', 'Pharmacy', 'pill', 'pharmacy', '/vendors', ''),
  ('care-4', 'care_actions', 'app', 4, 'Book lab test', 'Home or lab', 'flask-outline', 'labs', '/lab-tests', ''),
  ('spec-1', 'specialties', 'both', 1, 'Cardiology', '', 'heart-pulse', 'doctors', '/doctors?q=cardiology', 'Cardiologist'),
  ('spec-2', 'specialties', 'both', 2, 'Paediatrics', '', 'baby-face-outline', 'doctors', '/doctors?q=pediatrics', 'Pediatrician'),
  ('spec-3', 'specialties', 'both', 3, 'Urology', '', 'water', 'doctors', '/doctors?q=urology', 'Urologist'),
  ('spec-4', 'specialties', 'both', 4, 'Neurology', '', 'brain', 'doctors', '/doctors?q=neurology', 'Neurologist'),
  ('spec-5', 'specialties', 'both', 5, 'Dermatology', '', 'face-woman-shimmer', 'doctors', '/doctors?q=dermatology', 'Dermatologist'),
  ('spec-6', 'specialties', 'both', 6, 'Orthopedics', '', 'bone', 'doctors', '/doctors?q=orthopedics', 'Orthopedist'),
  ('spec-7', 'specialties', 'both', 7, 'General', '', 'stethoscope', 'doctors', '/doctors', 'General Physician');

INSERT INTO "site_settings" ("key", "value")
VALUES
  ('tagline', 'Care That Fits Your Life.'),
  ('contact_phone', '+92 300 123 4567'),
  ('contact_email', 'support@medzoos.pk'),
  ('contact_address', 'DHA Phase 6, Karachi, Pakistan'),
  ('landing_eyebrow', 'Healthcare, made simpler'),
  ('landing_headline', 'Your Healthcare. One Trusted Platform.'),
  ('landing_subhead', 'Doctors, medicines, labs, and hospitals — in one place.'),
  ('landing_cta_primary', 'Find a Doctor'),
  ('landing_cta_secondary', 'Explore services'),
  ('play_store_url', ''),
  ('app_store_url', '');
