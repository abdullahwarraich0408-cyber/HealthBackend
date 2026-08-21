const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { restrictTo } = require('../../middleware/role.middleware');
const prisma = require('../../config/database');
const catchAsync = require('../../utils/catchAsync');
const adminDoctorService = require('./adminDoctor.service');
const adminPracticeLocationService = require('./adminPracticeLocation.service');
const hospitalsController = require('../hospitals/hospitals.controller');
const hospitalsValidator = require('../hospitals/hospitals.validator');
const { validate } = require('../../middleware/validate.middleware');
const vendorsService = require('../vendors/vendors.service');
const vendorFinanceService = require('../vendors/vendor-finance.service');
const { recordAuditEntry } = require('../vendors/vendor-audit.service');
const productsService = require('../products/products.service');
const vendorNotificationsService = require('../notifications/vendor-notifications.service');
const homeSlidesController = require('../home-slides/homeSlides.controller');
const cmsController = require('../cms/cms.controller');

router.use(protect, restrictTo('admin'));

function summarizeVendorDocuments(documents = []) {
  const summary = {
    total: documents.length,
    verified: 0,
    pending: 0,
    rejected: 0,
  };

  for (const document of documents) {
    if (document.status === 'verified') summary.verified += 1;
    else if (document.status === 'rejected') summary.rejected += 1;
    else summary.pending += 1;
  }

  return summary;
}

router.get('/dashboard', catchAsync(async (req, res) => {
  const userCount = await prisma.user.count();
  const vendorCount = await prisma.vendor.count();
  const orderCount = await prisma.order.count();

  res.json({
    status: 'success',
    data: { userCount, vendorCount, orderCount }
  });
}));

router.get('/audit-logs', catchAsync(async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 100
  });
  res.json({ status: 'success', data: { logs } });
}));

router.get('/customers', catchAsync(async (req, res) => {
  const customers = await prisma.user.findMany({
    where: { role: 'customer' },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      created_at: true,
      orders: { select: { id: true } }
    }
  });
  res.json({ status: 'success', data: { customers } });
}));

router.get('/orders', catchAsync(async (req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      customer: { select: { name: true, email: true } },
      vendor: { select: { business_name: true } },
      items: true
    }
  });
  res.json({ status: 'success', data: { orders } });
}));

router.get('/prescription-orders', catchAsync(async (req, res) => {
  const prescriptionOrdersService = require('../prescription-orders/prescription-orders.service');
  const orders = await prescriptionOrdersService.getAllPrescriptionOrders();
  res.json({ status: 'success', data: { orders } });
}));

router.get('/products', catchAsync(async (req, res) => {
  const products = await productsService.getAdminProducts();
  res.json({ status: 'success', data: { products } });
}));

router.patch('/products/:id/review', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { approval_status, note } = req.body;

  const product = await productsService.reviewProduct(id, req.user.accountId || req.user.id, approval_status, note);

  await vendorNotificationsService.createVendorNotification({
    vendorId: product.vendor_id,
    type: approval_status === 'approved' ? 'product-approved' : approval_status === 'rejected' ? 'product-rejected' : 'product-review-updated',
    title: approval_status === 'approved' ? 'Product approved' : approval_status === 'rejected' ? 'Product requires changes' : 'Product review updated',
    message:
      approval_status === 'approved'
        ? `${product.name} is now live on the marketplace.`
        : approval_status === 'rejected'
          ? `${product.name} was rejected${note ? `: ${note}` : '.'}`
          : `${product.name} has been moved back to review.`,
    data: {
      productId: product.id,
      approval_status,
      note: note || null,
    },
  });

  res.json({ status: 'success', data: { product } });
}));

// Marketing Routes
router.get('/marketing/coupons', catchAsync(async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    orderBy: { created_at: 'desc' }
  });
  res.json({ status: 'success', data: { coupons } });
}));

router.post('/marketing/coupons', catchAsync(async (req, res) => {
  const { code, discount_type, discount_value, min_order_amount, start_date, expiry_date, usage_limit } = req.body;
  
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    return res.status(400).json({ status: 'error', message: 'Coupon code already exists' });
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      discount_type,
      discount_value: parseFloat(discount_value),
      min_order_amount: parseFloat(min_order_amount || 0),
      start_date: new Date(start_date),
      expiry_date: new Date(expiry_date),
      usage_limit: usage_limit ? parseInt(usage_limit) : null
    }
  });
  res.json({ status: 'success', data: { coupon } });
}));

router.delete('/marketing/coupons/:id', catchAsync(async (req, res) => {
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ status: 'success', message: 'Coupon deleted successfully' });
}));

router.get('/marketing/offers', catchAsync(async (req, res) => {
  const offers = await prisma.offer.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      vendor: { select: { business_name: true } },
      product: { select: { name: true } }
    }
  });
  res.json({ status: 'success', data: { offers } });
}));

router.get('/home-slides', homeSlidesController.listAdmin);
router.patch('/home-slides/:id', homeSlidesController.updateSlide);

router.get('/content', cmsController.listAdmin);
router.put('/content/settings', cmsController.updateSettings);
router.post('/content', cmsController.createItem);
router.patch('/content/:id', cmsController.updateItem);
router.delete('/content/:id', cmsController.deleteItem);

router.get('/vendors', catchAsync(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      account: { select: { email: true } },
      documents: {
        include: {
          reviews: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      },
      service_areas: {
        where: { is_active: true },
      },
      operating_hours: true,
    }
  });

  const mappedVendors = vendors.map((vendor) => ({
    id: vendor.id,
    business_name: vendor.business_name,
    email: vendor.account?.email || vendor.email,
    license_number: vendor.license_number,
    status: vendor.status,
    commission_rate: vendor.commission_rate,
    trade_license_url: vendor.trade_license_url,
    pharmacist_certificate_url: vendor.pharmacist_certificate_url,
    ntn: vendor.ntn,
    address: vendor.address,
    city: vendor.city,
    latitude: vendor.latitude,
    longitude: vendor.longitude,
    service_radius_km: vendor.service_radius_km,
    is_open: vendor.is_open,
    is_online: vendor.is_online,
    holiday_mode_enabled: vendor.holiday_mode_enabled,
    holiday_starts_at: vendor.holiday_starts_at,
    holiday_ends_at: vendor.holiday_ends_at,
    holiday_reason: vendor.holiday_reason,
    manual_online_override: vendor.manual_online_override,
    onboarding_submitted_at: vendor.onboarding_submitted_at,
    approved_at: vendor.approved_at,
    document_summary: summarizeVendorDocuments(vendor.documents || []),
    documents: (vendor.documents || []).map((document) => ({
      id: document.id,
      type: document.type,
      file_url: document.file_url,
      status: document.status,
      rejection_reason: document.rejection_reason,
      verified_at: document.verified_at,
      latest_review: document.reviews?.[0] || null,
    })),
    service_areas: vendor.service_areas || [],
    operating_hours: vendor.operating_hours || [],
    created_at: vendor.created_at,
  }));

  res.json({ status: 'success', data: { vendors: mappedVendors } });
}));

router.get('/vendors/pending', catchAsync(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: { in: ['pending', 'pending_review', 'rejected'] },
    },
    orderBy: { onboarding_submitted_at: 'desc' },
    include: {
      account: { select: { email: true } },
      documents: true,
    },
  });

  res.json({
    status: 'success',
    data: {
      vendors: vendors.map((vendor) => ({
        id: vendor.id,
        business_name: vendor.business_name,
        email: vendor.account?.email || vendor.email,
        status: vendor.status,
        onboarding_submitted_at: vendor.onboarding_submitted_at,
        document_summary: summarizeVendorDocuments(vendor.documents || []),
      })),
    },
  });
}));

router.post('/vendors', catchAsync(async (req, res) => {
  const {
    business_name,
    email,
    password,
    license_number,
    commission_rate,
    address,
    city,
    latitude,
    longitude,
    service_radius_km,
  } = req.body;

  if (!business_name || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'Business name, email, and password are required' });
  }

  if (!city && (latitude == null || longitude == null)) {
    return res.status(400).json({
      status: 'error',
      message: 'Pharmacy location is required. Provide a city or GPS coordinates.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingAccount = await prisma.account.findUnique({ where: { email: normalizedEmail } });
  if (existingAccount) {
    return res.status(400).json({ status: 'error', message: 'Email already in use' });
  }

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);
  const account = await prisma.account.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      role: 'vendor',
      vendor: {
        create: {
          business_name,
          email: normalizedEmail,
          license_number: license_number || 'PENDING',
          commission_rate: parseFloat(commission_rate || 10.0),
          status: 'pending_review',
          approved_at: null,
          last_status_change_at: new Date(),
          address: address || null,
          city: city || null,
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          service_radius_km: service_radius_km != null ? Number(service_radius_km) : 10,
          onboarding_submitted_at: new Date(),
        }
      }
    },
    include: { vendor: true }
  });
  await prisma.auditLog.create({
    data: { action: 'VENDOR_CREATED_PENDING_REVIEW', entity: 'vendor', entity_id: account.vendor.id, user_id: req.user.id }
  });
  res.json({
    status: 'success',
    message: 'Vendor created and submitted for verification review.',
    data: {
      vendor: {
        ...account.vendor,
        email: account.email
      }
    }
  });
}));

router.patch('/vendors/:id/status', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body; // status: 'approved', 'rejected', 'suspended'

  if (!['approved', 'rejected', 'suspended', 'active', 'pending_review'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'Invalid status' });
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      status,
      approved_at: ['approved', 'active'].includes(status) ? new Date() : null,
      last_status_change_at: new Date(),
    }
  });

  await recordAuditEntry({
    vendorId: id,
    userId: req.user.id,
    action: `VENDOR_${status.toUpperCase()}`,
    entity: 'vendor',
    entityId: id,
    details: note ? { note } : { status },
  });

  const inboxEvents = require('../notifications/inbox.events');
  await inboxEvents.vendorStatusChanged(vendor, status, note);

  res.json({ status: 'success', message: `Vendor marked as ${status}`, data: { vendor } });
}));

router.patch('/vendors/:id/approval', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status = 'approved', note } = req.body;

  if (!['approved', 'rejected', 'suspended', 'pending_review'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'Invalid approval status' });
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      status,
      approved_at: status === 'approved' ? new Date() : null,
      last_status_change_at: new Date(),
    },
  });

  await recordAuditEntry({
    vendorId: id,
    userId: req.user.id,
    action: 'VENDOR_APPROVAL_REVIEWED',
    entity: 'vendor',
    entityId: id,
    details: { status, note },
  });

  const inboxEvents = require('../notifications/inbox.events');
  await inboxEvents.vendorStatusChanged(vendor, status, note);

  res.json({ status: 'success', data: { vendor } });
}));

router.patch('/vendors/:id/credentials', catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    business_name,
    email,
    password,
    license_number,
    commission_rate,
    trade_license_url,
    pharmacist_certificate_url,
    ntn,
    bank_account_title,
    bank_account_number,
    bank_name,
    address,
    city,
    latitude,
    longitude,
    service_radius_km,
  } = req.body;

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { account: true }
  });

  if (!vendor) {
    return res.status(404).json({ status: 'error', message: 'Vendor not found' });
  }

  const vendorUpdateData = {};
  if (business_name) vendorUpdateData.business_name = business_name;
  if (license_number) vendorUpdateData.license_number = license_number;
  if (commission_rate !== undefined) vendorUpdateData.commission_rate = parseFloat(commission_rate);
  if (trade_license_url !== undefined) vendorUpdateData.trade_license_url = trade_license_url;
  if (pharmacist_certificate_url !== undefined) vendorUpdateData.pharmacist_certificate_url = pharmacist_certificate_url;
  if (ntn !== undefined) vendorUpdateData.ntn = ntn || null;
  if (bank_account_title !== undefined) vendorUpdateData.bank_account_title = bank_account_title || null;
  if (bank_account_number !== undefined) vendorUpdateData.bank_account_number = bank_account_number || null;
  if (bank_name !== undefined) vendorUpdateData.bank_name = bank_name || null;
  if (address !== undefined) vendorUpdateData.address = address || null;
  if (city !== undefined) vendorUpdateData.city = city || null;
  if (latitude !== undefined) vendorUpdateData.latitude = latitude !== null && latitude !== '' ? Number(latitude) : null;
  if (longitude !== undefined) vendorUpdateData.longitude = longitude !== null && longitude !== '' ? Number(longitude) : null;
  if (service_radius_km !== undefined) vendorUpdateData.service_radius_km = Number(service_radius_km || 10);

  const bcrypt = require('bcryptjs');
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  if (vendor.account_id) {
    const accountUpdateData = {};
    if (normalizedEmail) accountUpdateData.email = normalizedEmail;
    if (password) accountUpdateData.password = await bcrypt.hash(password, 12);

    if (normalizedEmail && normalizedEmail !== vendor.account.email) {
      const emailTaken = await prisma.account.findUnique({ where: { email: normalizedEmail } });
      if (emailTaken && emailTaken.id !== vendor.account_id) {
        return res.status(400).json({ status: 'error', message: 'Email already in use' });
      }
    }

    if (Object.keys(accountUpdateData).length > 0) {
      await prisma.account.update({
        where: { id: vendor.account_id },
        data: accountUpdateData
      });
    }

    if (normalizedEmail) vendorUpdateData.email = normalizedEmail;
  } else {
    if (normalizedEmail) vendorUpdateData.email = normalizedEmail;
    if (password) vendorUpdateData.password = await bcrypt.hash(password, 12);
  }

  const updatedVendor = await prisma.vendor.update({
    where: { id },
    data: vendorUpdateData,
    include: { account: { select: { email: true } } }
  });

  const updatedFields = Object.keys(vendorUpdateData).filter((key) => key !== 'password');
  if (normalizedEmail) updatedFields.push('email');
  if (password) updatedFields.push('password');

  await recordAuditEntry({
    vendorId: id,
    userId: req.user.id,
    action: 'VENDOR_CREDENTIALS_UPDATED',
    entity: 'vendor',
    entityId: id,
    details: { updated_fields: updatedFields.filter((field) => field !== 'password') },
  });

  res.json({
    status: 'success',
    message: 'Vendor credentials updated successfully',
    data: {
      vendor: {
        ...updatedVendor,
        email: updatedVendor.account?.email || updatedVendor.email
      }
    }
  });
}));

router.delete('/vendors/:id', catchAsync(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.vendor.delete({
      where: { id }
    });

    await prisma.auditLog.create({
      data: {
        action: 'VENDOR_DELETED',
        entity: 'vendor',
        entity_id: id,
        user_id: req.user.id
      }
    });

    res.json({ status: 'success', message: 'Vendor deleted successfully' });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Cannot delete vendor because they have associated products or orders. Please suspend them instead.' 
      });
    }
    throw error;
  }
}));

router.post('/vendors/:id/documents/:documentId/review', catchAsync(async (req, res) => {
  const { id, documentId } = req.params;
  const { status, notes } = req.body;

  if (!['verified', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'Invalid document review status' });
  }

  const document = await prisma.vendorDocument.findFirst({
    where: {
      id: documentId,
      vendor_id: id,
    },
  });

  if (!document) {
    return res.status(404).json({ status: 'error', message: 'Vendor document not found' });
  }

  const updatedDocument = await prisma.vendorDocument.update({
    where: { id: documentId },
    data: {
      status,
      verified_at: status === 'verified' ? new Date() : null,
      rejection_reason: status === 'rejected' ? (notes || 'Document rejected by admin') : null,
    },
  });

  await prisma.vendorDocumentReview.create({
    data: {
      document_id: documentId,
      vendor_id: id,
      reviewer_id: req.user.id,
      status,
      notes: notes || null,
    },
  });

  await recordAuditEntry({
    vendorId: id,
    userId: req.user.id,
    action: 'VENDOR_DOCUMENT_REVIEWED',
    entity: 'vendor_document',
    entityId: documentId,
    details: { status, notes, type: document.type },
  });

  res.json({ status: 'success', data: { document: updatedDocument } });
}));

router.get('/vendors/:id/availability', catchAsync(async (req, res) => {
  const availability = await vendorsService.getVendorAvailability(req.params.id);
  res.json({ status: 'success', data: { availability } });
}));

router.get('/vendors/:id/audit-logs', catchAsync(async (req, res) => {
  const logs = await prisma.vendorAuditLog.findMany({
    where: { vendor_id: req.params.id },
    orderBy: { created_at: 'desc' },
    take: 200,
  });
  res.json({ status: 'success', data: { logs } });
}));

router.post('/vendors/:id/commission', catchAsync(async (req, res) => {
  const { commission_rate } = req.body;
  const vendor = await prisma.vendor.update({
    where: { id: req.params.id },
    data: { commission_rate: parseFloat(commission_rate || 0) },
  });

  await recordAuditEntry({
    vendorId: req.params.id,
    userId: req.user.id,
    action: 'VENDOR_COMMISSION_UPDATED',
    entity: 'vendor',
    entityId: req.params.id,
    details: { commission_rate: vendor.commission_rate },
  });

  res.json({ status: 'success', data: { vendor } });
}));

router.get('/vendors/performance', catchAsync(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    where: { status: { in: ['approved', 'active'] } },
    select: { id: true, business_name: true },
    orderBy: { business_name: 'asc' },
  });

  const performance = await Promise.all(
    vendors.map(async (vendor) => {
      const metrics = await vendorsService.getVendorPerformanceMetrics(vendor.id);
      return {
        id: vendor.id,
        business_name: vendor.business_name,
        ...metrics,
      };
    })
  );

  res.json({ status: 'success', data: { performance } });
}));

router.get('/settlements', catchAsync(async (req, res) => {
  const settlements = await vendorFinanceService.listAdminSettlements();
  res.json({ status: 'success', data: { settlements } });
}));

router.post('/settlements/:id/release', catchAsync(async (req, res) => {
  const settlement = await vendorFinanceService.releaseSettlement(req.params.id, req.body.reference);
  await recordAuditEntry({
    vendorId: settlement.vendor_id,
    userId: req.user.id,
    action: 'VENDOR_SETTLEMENT_RELEASED',
    entity: 'vendor_settlement',
    entityId: settlement.id,
    details: { reference: req.body.reference || null },
  });
  res.json({ status: 'success', data: { settlement } });
}));

// --- Doctors Management ---
router.get('/doctors', catchAsync(async (req, res) => {
  const doctors = await prisma.doctor.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      account: { select: { email: true } },
      hospital_ref: { select: { id: true, name: true } },
    },
  });

  const mappedDoctors = doctors.map((doctor) => ({
    id: doctor.id,
    name: doctor.name,
    email: doctor.account?.email || doctor.email,
    specialty: doctor.specialty,
    experience_years: doctor.experience_years,
    fee: doctor.fee,
    rating: doctor.rating,
    is_active: doctor.is_active,
    hospital_id: doctor.hospital_id,
    hospital: doctor.hospital_ref?.name || doctor.hospital,
    created_at: doctor.created_at,
  }));

  res.json({ status: 'success', data: { doctors: mappedDoctors } });
}));

router.post('/doctors', catchAsync(async (req, res) => {
  const doctor = await adminDoctorService.createDoctor(req.body, req.user?.id);

  res.json({
    status: 'success',
    data: { doctor },
  });
}));

router.patch('/doctors/:id/status', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { is_active, note } = req.body;
  const doctor = await prisma.doctor.update({ where: { id }, data: { is_active } });
  
  if (note) {
    await prisma.auditLog.create({
      data: { action: `DOCTOR_STATUS_CHANGED`, entity: 'doctor', entity_id: id, details: { note, is_active }, user_id: req.user.id }
    });
  }
  res.json({ status: 'success', message: 'Doctor status updated', data: { doctor } });
}));

router.delete('/doctors/:id', catchAsync(async (req, res) => {
  await prisma.doctor.delete({ where: { id: req.params.id } });
  await prisma.auditLog.create({
    data: { action: 'DOCTOR_DELETED', entity: 'doctor', entity_id: req.params.id, user_id: req.user.id }
  });
  res.json({ status: 'success', message: 'Doctor deleted successfully' });
}));

router.get('/doctors/:id/appointments', catchAsync(async (req, res) => {
  const appointments = await prisma.doctorAppointment.findMany({
    where: { doctor_id: req.params.id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      prescription: true,
    },
    orderBy: { appointment_date: 'desc' },
  });

  const revenue = appointments
    .filter((item) => item.status === 'completed' && item.payment_status === 'paid')
    .reduce((sum, item) => sum + item.fee, 0);

  res.json({
    status: 'success',
    data: {
      appointments,
      summary: {
        total: appointments.length,
        revenue,
        completed: appointments.filter((item) => item.status === 'completed').length,
        pending: appointments.filter((item) => item.status === 'pending').length,
      },
    },
  });
}));

router.get('/doctors/:id/practice-locations', catchAsync(async (req, res) => {
  const locations = await adminPracticeLocationService.listPracticeLocations(req.params.id);
  res.json({ status: 'success', data: { locations } });
}));

router.post('/doctors/:id/practice-locations', catchAsync(async (req, res) => {
  const location = await adminPracticeLocationService.createPracticeLocation(req.params.id, req.body);
  res.json({ status: 'success', data: { location } });
}));

router.patch('/doctors/:doctorId/practice-locations/:locationId', catchAsync(async (req, res) => {
  const location = await adminPracticeLocationService.updatePracticeLocation(
    req.params.doctorId,
    req.params.locationId,
    req.body
  );
  res.json({ status: 'success', data: { location } });
}));

router.delete('/doctors/:doctorId/practice-locations/:locationId', catchAsync(async (req, res) => {
  const result = await adminPracticeLocationService.deletePracticeLocation(
    req.params.doctorId,
    req.params.locationId
  );
  res.json({ status: 'success', data: result });
}));

// --- Hospitals Management ---
router.get('/hospitals', hospitalsController.listAdminHospitals);
router.post(
  '/hospitals',
  validate(hospitalsValidator.createHospitalSchema),
  hospitalsController.createHospital
);
router.patch(
  '/hospitals/:id',
  validate(hospitalsValidator.updateHospitalSchema),
  hospitalsController.updateHospital
);
router.patch(
  '/hospitals/:id/status',
  validate(hospitalsValidator.hospitalStatusSchema),
  hospitalsController.setHospitalStatus
);
router.delete('/hospitals/:id', hospitalsController.deleteHospital);

// --- Lab Partners Management ---
router.get('/labs', catchAsync(async (req, res) => {
  const labs = await prisma.labPartner.findMany({
    orderBy: { created_at: 'desc' },
    select: {
      id: true, name: true, email: true, license_number: true, status: true, created_at: true
    }
  });
  res.json({ status: 'success', data: { labs } });
}));

router.post('/labs', catchAsync(async (req, res) => {
  const { name, email, password, license_number } = req.body;
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 12);
  const account = await prisma.account.create({
    data: {
      email,
      password: hashedPassword,
      role: 'lab',
      lab_partner: {
        create: {
          name,
          license_number: license_number || 'PENDING',
          status: 'approved'
        }
      }
    },
    include: { lab_partner: true }
  });
  await prisma.auditLog.create({
    data: { action: 'LAB_CREATED', entity: 'lab', entity_id: account.lab_partner.id, user_id: req.user.id }
  });
  res.json({ status: 'success', data: { lab: account.lab_partner } });
}));

router.patch('/labs/:id/status', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body; // 'approved', 'rejected', 'suspended'
  const lab = await prisma.labPartner.update({ where: { id }, data: { status } });
  
  if (note) {
    await prisma.auditLog.create({
      data: { action: `LAB_${status.toUpperCase()}`, entity: 'lab', entity_id: id, details: { note }, user_id: req.user.id }
    });
  }
  res.json({ status: 'success', message: `Lab marked as ${status}`, data: { lab } });
}));

router.delete('/labs/:id', catchAsync(async (req, res) => {
  await prisma.labPartner.delete({ where: { id: req.params.id } });
  await prisma.auditLog.create({
    data: { action: 'LAB_DELETED', entity: 'lab', entity_id: req.params.id, user_id: req.user.id }
  });
  res.json({ status: 'success', message: 'Lab deleted successfully' });
}));

// --- Impersonation ---
const { generateTokens } = require('../auth/auth.helper');

router.post('/impersonate', catchAsync(async (req, res) => {
  const { entity_id, role } = req.body; // role: 'vendor', 'doctor', 'lab'
  
  let profile = null;
  if (role === 'vendor') profile = await prisma.vendor.findUnique({ where: { id: entity_id } });
  else if (role === 'doctor') profile = await prisma.doctor.findUnique({ where: { id: entity_id } });
  else if (role === 'lab') profile = await prisma.labPartner.findUnique({ where: { id: entity_id } });
  else if (role === 'customer') profile = await prisma.user.findUnique({ where: { id: entity_id } });

  if (!profile) {
    return res.status(404).json({ status: 'error', message: `${role} not found` });
  }

  // Find associated account if unified auth
  let account = null;
  if (profile.account_id) {
    account = await prisma.account.findUnique({ where: { id: profile.account_id } });
  }
  
  const payload = { ...profile, role, accountId: account ? account.id : profile.id };
  const tokens = generateTokens(payload);

  await prisma.auditLog.create({
    data: { action: 'IMPERSONATION_STARTED', entity: role, entity_id, user_id: req.user.id }
  });

  res.json({ status: 'success', message: `Successfully impersonating ${role}`, data: { tokens, role, profile } });
}));

module.exports = router;
