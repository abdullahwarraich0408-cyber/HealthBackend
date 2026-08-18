const prisma = require('../config/database');

async function seedOffers() {
  console.log('Seeding initial Medzoos offers...');

  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const initialOffers = [
    {
      title: '15% Off All Diabetes Care & Monitoring Devices',
      short_description: 'Save 15% on glucose meters, test strips, and insulin supplies.',
      description: 'Get 15% discount on all diabetes medicines and monitoring devices from verified pharmacies on Medzoos.',
      type: 'PERCENTAGE_DISCOUNT',
      discount_type: 'PERCENTAGE',
      percentage_value: 15,
      maximum_discount_amount: 1500,
      minimum_order_amount: 2000,
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'MEDZOOS',
      automatic_apply: true,
      banner_image: '/images/hero-consult-doctor.png',
      terms_and_conditions: 'Valid on diabetes category products. Maximum discount PKR 1,500.',
    },
    {
      title: 'HbA1c & Diabetes Lab Package - 20% Off',
      short_description: 'Special 20% discount on comprehensive HbA1c & blood sugar lab panels.',
      description: 'Book home sampling lab tests for HbA1c and lipid profile with top certified laboratories in Pakistan.',
      type: 'LAB_OFFER',
      discount_type: 'PERCENTAGE',
      percentage_value: 20,
      maximum_discount_amount: 2000,
      minimum_order_amount: 2500,
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'LAB',
      automatic_apply: true,
      banner_image: '/images/hero-consult-doctor.png',
      terms_and_conditions: 'Valid for home sampling lab test bookings on Medzoos.',
    },
    {
      title: 'Visa Cardholder Special - Flat PKR 500 Off',
      short_description: 'Pay with any Visa debit or credit card to get PKR 500 discount.',
      description: 'Enjoy PKR 500 off on your healthcare orders when you pay using a Visa card at checkout.',
      type: 'BANK_OFFER',
      discount_type: 'FIXED',
      fixed_amount: 500,
      minimum_order_amount: 3000,
      payment_method_ids: ['visa', 'card', 'online'],
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'BANK',
      partner_logo: 'VISA',
      automatic_apply: true,
      terms_and_conditions: 'Requires Visa card payment at checkout. Minimum spend PKR 3,000.',
    },
    {
      title: 'Easypaisa Cashback & Discount - PKR 300 Off',
      short_description: 'Instant PKR 300 discount when paying via Easypaisa wallet.',
      description: 'Pay via Easypaisa mobile wallet and get flat PKR 300 off on your medicine and lab bookings.',
      type: 'WALLET_OFFER',
      discount_type: 'FIXED',
      fixed_amount: 300,
      minimum_order_amount: 2000,
      payment_method_ids: ['easypaisa', 'wallet'],
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'BANK',
      partner_logo: 'Easypaisa',
      automatic_apply: true,
      terms_and_conditions: 'Valid when selecting Easypaisa payment method at checkout.',
    },
    {
      title: 'Free Delivery on Medicine Orders over PKR 1,500',
      short_description: 'Zero delivery charges on all pharmacy orders above PKR 1,500.',
      description: 'Get fast door-step delivery from partner pharmacies without any delivery fee.',
      type: 'FREE_DELIVERY',
      discount_type: 'FREE_DELIVERY',
      minimum_order_amount: 1500,
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'MEDZOOS',
      stackable: true,
      automatic_apply: true,
      terms_and_conditions: 'Applies automatically to cart when order total reaches PKR 1,500.',
    },
    {
      title: 'Welcome Offer: PKR 500 Off First Order',
      short_description: 'Use promo code MEDZOOS500 on your first healthcare order.',
      description: 'New to Medzoos? Use code MEDZOOS500 to get PKR 500 discount on your first medicine or lab booking.',
      type: 'PROMO_CODE',
      discount_type: 'FIXED',
      fixed_amount: 500,
      promo_code: 'MEDZOOS500',
      minimum_order_amount: 2500,
      new_users_only: true,
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'MEDZOOS',
      automatic_apply: false,
      terms_and_conditions: 'First order only. Enter promo code MEDZOOS500 at checkout.',
    },
    {
      title: 'First Online Doctor Consultation - 25% Off',
      short_description: '25% discount on video consultations with verified specialist doctors.',
      description: 'Consult certified medical specialists from the comfort of your home with a 25% launch offer.',
      type: 'CONSULTATION_OFFER',
      discount_type: 'PERCENTAGE',
      percentage_value: 25,
      maximum_discount_amount: 1000,
      minimum_order_amount: 1000,
      start_at: now,
      end_at: nextMonth,
      expiry_date: nextMonth,
      status: 'ACTIVE',
      funding_source: 'DOCTOR',
      automatic_apply: true,
      terms_and_conditions: 'Valid for online video consultation appointments.',
    },
  ];

  for (const offerData of initialOffers) {
    const existing = await prisma.offer.findFirst({
      where: { title: offerData.title },
    });
    if (!existing) {
      await prisma.offer.create({ data: offerData });
      console.log(`Created offer: ${offerData.title}`);
    }
  }

  console.log('Medzoos offers seeding completed!');
}

seedOffers()
  .catch((e) => {
    console.error('Error seeding offers:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
