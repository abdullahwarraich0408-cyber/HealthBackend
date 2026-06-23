const { z } = require('zod');

const vendorRegisterSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    business_name: z.string().min(2),
    license_number: z.string().min(4)
  })
});

const updateVendorSchema = z.object({
  body: z.object({
    business_name: z.string().min(2).optional(),
    license_number: z.string().min(4).optional(),
    trade_license_url: z.string().url().optional().or(z.string().length(0)),
    pharmacist_certificate_url: z.string().url().optional().or(z.string().length(0)),
    password: z.string().min(8).optional().or(z.string().length(0)),
  })
});

module.exports = {
  vendorRegisterSchema,
  updateVendorSchema
};
