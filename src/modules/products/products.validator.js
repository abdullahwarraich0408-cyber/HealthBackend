const { z } = require('zod');

const optionalString = z.string().optional().or(z.literal(''));
const optionalNumber = z.union([z.number(), z.string()]).optional();
const optionalBool = z.union([z.boolean(), z.string()]).optional();

const productBody = {
  formula: optionalString,
  generic_name: optionalString,
  brand_name: optionalString,
  brand: optionalString,
  manufacturer: optionalString,
  description: optionalString,
  usage_instructions: optionalString,
  warnings: optionalString,
  side_effects: optionalString,
  contraindications: optionalString,
  price: z.number().nonnegative().optional(),
  retail_price: z.number().nonnegative().optional(),
  sale_price: z.number().nonnegative().nullable().optional(),
  cost_price: z.number().nonnegative().nullable().optional(),
  stock: z.number().int().nonnegative().optional(),
  category: optionalString,
  subcategory: optionalString,
  dosage_form: optionalString,
  strength: optionalString,
  pack_size: optionalString,
  sku: optionalString,
  barcode: optionalString,
  image_url: z.string().url().optional().or(z.string().length(0)),
  prescription_required: optionalBool,
  controlled_medicine: optionalBool,
  listing_status: optionalString,
  low_stock_threshold: z.number().int().nonnegative().optional(),
  submit: z.boolean().optional(),
  save_as_draft: z.boolean().optional(),
  approval_status: optionalString,
};

const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    price: z.number().nonnegative().optional(),
    retail_price: z.number().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    ...productBody,
  }).refine((data) => data.price != null || data.retail_price != null, {
    message: 'Retail price is required',
    path: ['price'],
  }),
});

const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    ...productBody,
  }),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
};
