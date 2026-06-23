const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const usersRoutes = require('../modules/users/users.routes');
const vendorsRoutes = require('../modules/vendors/vendors.routes');
const productsRoutes = require('../modules/products/products.routes');
const ordersRoutes = require('../modules/orders/orders.routes');
const cartRoutes = require('../modules/cart/cart.routes');
const customerCartRoutes = require('../modules/cart/customerCart.routes');
const paymentsRoutes = require('../modules/payments/payments.routes');
const prescriptionsRoutes = require('../modules/prescriptions/prescriptions.routes');
const reviewsRoutes = require('../modules/reviews/reviews.routes');
const searchRoutes = require('../modules/search/search.routes');
const reportsRoutes = require('../modules/reports/reports.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const payoutsRoutes = require('../modules/payouts/payouts.routes');
const categoriesRoutes = require('../modules/categories/categories.routes');
const uploadRoutes = require('../modules/upload/upload.routes');
const couponRoutes = require('../modules/coupons/coupons.routes');
const vendorOfferRoutes = require('../modules/offers/offers.routes');
const { inventoryRouter, productsRouter } = require('../modules/inventory/inventory.routes');
const { customerReturnsRouter, adminReturnsRouter, vendorReturnsRouter } = require('../modules/returns/returns.routes');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const addressesRoutes = require('../modules/users/addresses.routes');
const usersController = require('../modules/users/users.controller');
const usersValidator = require('../modules/users/users.validator');
const { validate } = require('../middleware/validate.middleware');
const prescriptionsController = require('../modules/prescriptions/prescriptions.controller');
const couponsController = require('../modules/coupons/coupons.controller');
const doctorsRoutes = require('../modules/doctors/doctors.routes');
const hospitalsRoutes = require('../modules/hospitals/hospitals.routes');
const labTestsRoutes = require('../modules/lab-tests/labTests.routes');
const doctorPortalRoutes = require('../modules/partners/doctor-portal.routes');
const labPortalRoutes = require('../modules/partners/lab-portal.routes');
const telehealthRoutes = require('../modules/telehealth/telehealth.routes');
const prescriptionOrdersRoutes = require('../modules/prescription-orders/prescription-orders.routes');

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/vendors', vendorsRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/cart', cartRoutes);
router.use('/customer/cart', customerCartRoutes);
router.use('/payments', paymentsRoutes);
router.use('/prescriptions', prescriptionsRoutes);
router.use('/coupons', couponRoutes);
router.use('/vendor/offers', vendorOfferRoutes);
router.use('/vendor/inventory', inventoryRouter);
router.use('/vendor/products', productsRouter);
router.use('/customer/returns', customerReturnsRouter);
router.use('/admin/returns', adminReturnsRouter);
router.use('/vendor/returns', vendorReturnsRouter);
router.use('/addresses', addressesRoutes);
router.post('/notifications/preferences', protect, validate(usersValidator.updateNotificationPreferencesSchema), usersController.updateNotificationPreferences);

router.get('/customer/prescriptions', protect, restrictTo('customer'), prescriptionsController.getMyPrescriptions);
router.get('/customer/coupons', protect, restrictTo('customer'), couponsController.listApplicableCoupons);
router.use('/reviews', reviewsRoutes);
router.use('/search', searchRoutes);
router.use('/reports', reportsRoutes);
router.use('/admin', adminRoutes);
router.use('/payouts', payoutsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/upload', uploadRoutes);
router.use('/doctors', doctorsRoutes);
router.use('/hospitals', hospitalsRoutes);
router.use('/lab-tests', labTestsRoutes);
router.use('/partners/doctor', doctorPortalRoutes);
router.use('/partners/lab', labPortalRoutes);
router.use('/telehealth', telehealthRoutes);
router.use('/prescription-orders', prescriptionOrdersRoutes);

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'PharmaHub API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
