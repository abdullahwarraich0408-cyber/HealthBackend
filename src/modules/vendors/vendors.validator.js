const { z } = require('zod');

const optionalString = z.string().optional().or(z.literal(''));
const optionalUrl = z.string().url().optional().or(z.literal(''));
const optionalNumber = z.union([z.number(), z.string()]).optional();

const vendorRegisterSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    business_name: z.string().min(2),
    license_number: z.string().min(4),
    address: optionalString,
    city: optionalString,
    latitude: optionalNumber,
    longitude: optionalNumber,
    service_radius_km: optionalNumber,
    ntn: optionalString,
    bank_account_title: optionalString,
    bank_account_number: optionalString,
    bank_name: optionalString,
    trade_license_url: optionalUrl,
    pharmacist_certificate_url: optionalUrl,
    tax_certificate_url: optionalUrl,
    bank_document_url: optionalUrl,
    documents: z
      .array(
        z.object({
          type: z.string().min(2),
          file_url: z.string().url(),
          metadata: z.any().optional(),
        })
      )
      .optional(),
  }),
});

const updateVendorSchema = z.object({
  body: z.object({
    business_name: z.string().min(2).optional(),
    license_number: z.string().min(4).optional(),
    trade_license_url: optionalUrl,
    pharmacist_certificate_url: optionalUrl,
    password: z.string().min(8).optional().or(z.string().length(0)),
    email: z.string().email().optional(),
    ntn: optionalString,
    bank_account_title: optionalString,
    bank_account_number: optionalString,
    bank_name: optionalString,
    iban: optionalString,
    payout_schedule: optionalString,
    phone: optionalString,
    whatsapp: optionalString,
    logo_url: optionalUrl,
    province: optionalString,
    postal_code: optionalString,
    legal_business_name: optionalString,
    owner_name: optionalString,
    business_type: optionalString,
    license_expiry: optionalString,
    pickup_enabled: z.boolean().optional(),
    delivery_enabled: z.boolean().optional(),
    min_order_amount: optionalNumber,
    preparation_time_minutes: optionalNumber,
    notification_preferences: z.any().optional(),
    address: optionalString,
    city: optionalString,
    latitude: optionalNumber,
    longitude: optionalNumber,
    service_radius_km: optionalNumber,
    is_open: z.boolean().optional(),
    is_online: z.boolean().optional(),
    holiday_mode_enabled: z.boolean().optional(),
    holiday_starts_at: optionalString,
    holiday_ends_at: optionalString,
    holiday_reason: optionalString,
    manual_online_override: z.boolean().nullable().optional(),
    tax_certificate_url: optionalUrl,
    bank_document_url: optionalUrl,
    documents: z
      .array(
        z.object({
          type: z.string().min(2),
          file_url: z.string().url(),
          metadata: z.any().optional(),
        })
      )
      .optional(),
  }),
});

const operatingHoursSchema = z.object({
  body: z.object({
    hours: z.array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        open_time: optionalString,
        close_time: optionalString,
        is_closed: z.boolean().optional(),
      })
    ),
  }),
});

const serviceAreasSchema = z.object({
  body: z.object({
    areas: z.array(
      z.object({
        name: z.string().min(2),
        city: optionalString,
        postal_codes: z.array(z.string()).optional(),
        is_active: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      })
    ),
  }),
});

const availabilitySchema = z.object({
  body: z.object({
    is_open: z.boolean().optional(),
    is_online: z.boolean().optional(),
    service_radius_km: optionalNumber,
    holiday_mode_enabled: z.boolean().optional(),
    holiday_starts_at: optionalString,
    holiday_ends_at: optionalString,
    holiday_reason: optionalString,
    manual_online_override: z.boolean().nullable().optional(),
  }),
});

module.exports = {
  vendorRegisterSchema,
  updateVendorSchema,
  operatingHoursSchema,
  serviceAreasSchema,
  availabilitySchema,
};
