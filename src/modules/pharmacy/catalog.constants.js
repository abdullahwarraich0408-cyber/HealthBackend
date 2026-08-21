const MEDICINE_CATEGORIES = [
  { name: 'Pain Relief', slug: 'pain-relief', children: ['Headache', 'Muscle Pain', 'Fever'] },
  { name: 'Cold & Flu', slug: 'cold-flu', children: ['Cough', 'Congestion', 'Sore Throat'] },
  { name: 'Digestive Health', slug: 'digestive-health', children: ['Antacid', 'Laxative', 'Probiotic'] },
  { name: 'Allergy', slug: 'allergy', children: ['Antihistamine', 'Nasal Spray'] },
  { name: 'Diabetes', slug: 'diabetes', children: ['Glucose Control', 'Supplies'] },
  { name: 'Cardiovascular', slug: 'cardiovascular', children: ['Blood Pressure', 'Cholesterol'] },
  { name: 'Antibiotics', slug: 'antibiotics', children: [] },
  { name: 'Dermatology', slug: 'dermatology', children: ['Acne', 'Eczema', 'Antifungal'] },
  { name: 'Vitamins & Supplements', slug: 'vitamins-supplements', children: ['Multivitamin', 'Vitamin D', 'Minerals'] },
  { name: 'Mother & Baby', slug: 'mother-baby', children: ['Infant Care', 'Prenatal'] },
  { name: 'First Aid', slug: 'first-aid', children: ['Dressings', 'Antiseptic'] },
  { name: 'Personal Care', slug: 'personal-care', children: [] },
  { name: 'Prescription', slug: 'prescription', children: [] },
  { name: 'Other', slug: 'other', children: [] },
];

const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Drops',
  'Cream',
  'Gel',
  'Ointment',
  'Inhaler',
  'Powder',
  'Sachet',
  'Other',
];

const PRODUCT_APPROVAL_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'changes_requested',
];

const PRODUCT_LISTING_STATUSES = ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED'];

const INVENTORY_TRANSACTION_TYPES = [
  'STOCK_IN',
  'SALE',
  'ORDER_RESERVED',
  'ORDER_RELEASED',
  'RETURN',
  'DAMAGED',
  'EXPIRED',
  'MANUAL_ADJUSTMENT',
];

const STAFF_ROLES = ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY_MANAGER', 'ORDER_STAFF', 'VIEWER'];

const PRESCRIPTION_REVIEW_STATUSES = [
  'PENDING_REVIEW',
  'UNDER_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'CLARIFICATION_REQUIRED',
  'EXPIRED',
  'CONVERTED_TO_ORDER',
];

const PRESCRIPTION_REJECTION_REASONS = [
  'Prescription unclear',
  'Prescription expired',
  'Medicine unavailable',
  'Quantity issue',
  'Invalid prescription',
  'Needs doctor clarification',
  'Other',
];

const ORDER_REJECTION_REASONS = [
  'Out of stock',
  'Unable to fulfill',
  'Pharmacy closed',
  'Prescription issue',
  'Pricing issue',
  'Other',
];

const RETURN_REASONS = [
  'Wrong item',
  'Damaged item',
  'Incorrect quantity',
  'Expired product',
  'Quality issue',
  'Delivery issue',
  'Other',
];

const PHARMA_RETURN_BLOCKED_REASONS = [];

function normalizeCategoryName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = MEDICINE_CATEGORIES.find(
    (category) => category.name.toLowerCase() === raw.toLowerCase() || category.slug === raw.toLowerCase()
  );
  return match ? match.name : raw;
}

function isKnownCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return MEDICINE_CATEGORIES.some(
    (category) => category.name.toLowerCase() === raw || category.slug === raw
  );
}

function flattenCategories() {
  return MEDICINE_CATEGORIES.map((category) => ({
    name: category.name,
    slug: category.slug,
    subcategories: category.children,
  }));
}

module.exports = {
  MEDICINE_CATEGORIES,
  DOSAGE_FORMS,
  PRODUCT_APPROVAL_STATUSES,
  PRODUCT_LISTING_STATUSES,
  INVENTORY_TRANSACTION_TYPES,
  STAFF_ROLES,
  PRESCRIPTION_REVIEW_STATUSES,
  PRESCRIPTION_REJECTION_REASONS,
  ORDER_REJECTION_REASONS,
  RETURN_REASONS,
  PHARMA_RETURN_BLOCKED_REASONS,
  normalizeCategoryName,
  isKnownCategory,
  flattenCategories,
};
