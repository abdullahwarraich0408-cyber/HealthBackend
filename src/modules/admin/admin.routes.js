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

router.use(protect, restrictTo('admin'));

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
  const products = await prisma.product.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      vendor: { select: { business_name: true } }
    }
  });
  res.json({ status: 'success', data: { products } });
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

router.get('/vendors', catchAsync(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      account: { select: { email: true } }
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
    created_at: vendor.created_at
  }));

  res.json({ status: 'success', data: { vendors: mappedVendors } });
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
          status: 'approved',
          address: address || null,
          city: city || null,
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          service_radius_km: service_radius_km != null ? Number(service_radius_km) : 10,
        }
      }
    },
    include: { vendor: true }
  });
  await prisma.auditLog.create({
    data: { action: 'VENDOR_CREATED', entity: 'vendor', entity_id: account.vendor.id, user_id: req.user.id }
  });
  res.json({
    status: 'success',
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

  if (!['approved', 'rejected', 'suspended', 'active'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'Invalid status' });
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data: { status }
  });

  // Optionally log the note to audit logs here
  if (note) {
    await prisma.auditLog.create({
      data: {
        action: `VENDOR_${status.toUpperCase()}`,
        entity: 'vendor',
        entity_id: id,
        details: { note },
        user_id: req.user.id
      }
    });
  }

  res.json({ status: 'success', message: `Vendor marked as ${status}`, data: { vendor } });
}));

router.patch('/vendors/:id/credentials', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { business_name, email, password, license_number, commission_rate, trade_license_url, pharmacist_certificate_url } = req.body;

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

  await prisma.auditLog.create({
    data: {
      action: 'VENDOR_CREDENTIALS_UPDATED',
      entity: 'vendor',
      entity_id: id,
      details: { updated_fields: updatedFields.filter((field) => field !== 'password') },
      user_id: req.user.id
    }
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
