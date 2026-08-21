const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { hashPassword } = require('../auth/auth.helper');
const {
  ACTIVE_VENDOR_STATUSES,
  computeVendorAvailability,
  serviceAreaMatches,
} = require('./vendor-availability.service');
const { getVendorEarningsSummary, listVendorSettlements } = require('./vendor-finance.service');
const { recordAuditEntry } = require('./vendor-audit.service');

const DOCUMENT_TYPE_URL_FIELDS = {
  trade_license: 'trade_license_url',
  pharmacist_certificate: 'pharmacist_certificate_url',
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDocumentPayload(data = {}) {
  const documents = Array.isArray(data.documents) ? [...data.documents] : [];
  for (const [type, field] of Object.entries(DOCUMENT_TYPE_URL_FIELDS)) {
    if (data[field]) {
      documents.push({ type, file_url: data[field] });
    }
  }
  if (data.tax_certificate_url) {
    documents.push({ type: 'tax_certificate', file_url: data.tax_certificate_url });
  }
  if (data.bank_document_url) {
    documents.push({ type: 'bank_details', file_url: data.bank_document_url });
  }
  return documents.filter((document) => document?.type && document?.file_url);
}

async function syncVendorDocuments(tx, vendorId, data = {}, uploadedBy = 'vendor') {
  const documents = buildDocumentPayload(data);
  for (const document of documents) {
    const latest = await tx.vendorDocument.findFirst({
      where: { vendor_id: vendorId, type: document.type },
      orderBy: { created_at: 'desc' },
    });

    const nextValues = {
      file_url: document.file_url,
      status: 'pending',
      uploaded_by: uploadedBy,
      verified_at: null,
      rejection_reason: null,
      metadata: document.metadata || undefined,
    };

    if (latest) {
      await tx.vendorDocument.update({
        where: { id: latest.id },
        data: nextValues,
      });
    } else {
      await tx.vendorDocument.create({
        data: {
          vendor_id: vendorId,
          type: document.type,
          ...nextValues,
        },
      });
    }
  }
}

function mapDocumentSummary(documents = []) {
  return documents.map((document) => ({
    id: document.id,
    type: document.type,
    file_url: document.file_url,
    status: document.status,
    verified_at: document.verified_at,
    rejection_reason: document.rejection_reason,
    latest_review: document.reviews?.[0] || null,
  }));
}

function maskAccountNumber(value) {
  const raw = String(value || '');
  if (raw.length < 4) return raw ? '••••' : null;
  return `${raw.slice(0, 2)}••••••${raw.slice(-4)}`;
}

function mapLifecycleStatus(status) {
  const raw = String(status || 'pending').toLowerCase();
  if (['approved', 'active'].includes(raw)) return 'ACTIVE';
  if (raw === 'under_review') return 'UNDER_REVIEW';
  if (raw === 'suspended') return 'SUSPENDED';
  if (raw === 'rejected') return 'REJECTED';
  return 'PENDING';
}

function mapVendorProfile(vendor) {
  if (!vendor) return null;

  const availability = computeVendorAvailability(vendor);
  const lifecycle = mapLifecycleStatus(vendor.status);
  const expiringDocs = (vendor.documents || []).filter((document) => {
    if (!document.expires_at) return false;
    const days = (new Date(document.expires_at) - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  });

  return {
    id: vendor.id,
    email: vendor.account?.email || vendor.email,
    business_name: vendor.business_name,
    license_number: vendor.license_number,
    license_expiry: vendor.license_expiry || null,
    status: vendor.status,
    lifecycle_status: lifecycle,
    selling_allowed: ACTIVE_VENDOR_STATUSES.includes(vendor.status),
    commission_rate: vendor.commission_rate,
    trade_license_url: vendor.trade_license_url,
    pharmacist_certificate_url: vendor.pharmacist_certificate_url,
    ntn: vendor.ntn,
    bank_account_title: vendor.bank_account_title,
    bank_account_number: vendor.bank_account_number,
    bank_account_number_masked: maskAccountNumber(vendor.bank_account_number || vendor.iban),
    bank_name: vendor.bank_name,
    iban: vendor.iban,
    iban_masked: maskAccountNumber(vendor.iban),
    payout_schedule: vendor.payout_schedule,
    slug: vendor.slug,
    phone: vendor.phone,
    whatsapp: vendor.whatsapp,
    logo_url: vendor.logo_url,
    address: vendor.address,
    city: vendor.city,
    province: vendor.province,
    postal_code: vendor.postal_code,
    legal_business_name: vendor.legal_business_name,
    owner_name: vendor.owner_name,
    business_type: vendor.business_type,
    pickup_enabled: vendor.pickup_enabled,
    delivery_enabled: vendor.delivery_enabled,
    min_order_amount: vendor.min_order_amount,
    preparation_time_minutes: vendor.preparation_time_minutes,
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
    notification_preferences: vendor.notification_preferences || {},
    onboarding_submitted_at: vendor.onboarding_submitted_at,
    approved_at: vendor.approved_at,
    availability,
    documents: mapDocumentSummary(vendor.documents || []),
    operating_hours: vendor.operating_hours || [],
    service_areas: vendor.service_areas || [],
    compliance_alerts: [
      ...(lifecycle !== 'ACTIVE'
        ? [
            lifecycle === 'SUSPENDED'
              ? 'Your selling privileges are temporarily suspended. Contact Medzoos support.'
              : 'Your pharmacy account is under verification.',
          ]
        : []),
      ...(expiringDocs.length ? ['License or compliance document expires within 30 days'] : []),
      ...((vendor.documents || []).some((document) => document.status === 'rejected')
        ? ['Compliance document rejected']
        : []),
    ],
    created_at: vendor.created_at,
    updated_at: vendor.updated_at,
  };
}

async function registerVendor(data) {
  const normalizedEmail = normalizeEmail(data.email);
  const [existingAccount, existingVendor] = await Promise.all([
    prisma.account.findUnique({ where: { email: normalizedEmail } }),
    prisma.vendor.findUnique({ where: { email: normalizedEmail } }),
  ]);

  if (existingAccount || existingVendor) {
    throw new AppError('Email already in use by another vendor', 400);
  }

  const hashedPassword = await hashPassword(data.password);
  const vendor = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        role: 'vendor',
        vendor: {
          create: {
            email: normalizedEmail,
            business_name: data.business_name,
            license_number: data.license_number,
            status: 'pending',
            commission_rate: sanitizeNumber(data.commission_rate, 10) || 10,
            trade_license_url: data.trade_license_url || null,
            pharmacist_certificate_url: data.pharmacist_certificate_url || null,
            ntn: data.ntn || null,
            bank_account_title: data.bank_account_title || null,
            bank_account_number: data.bank_account_number || null,
            bank_name: data.bank_name || null,
            address: data.address || null,
            city: data.city || null,
            latitude: sanitizeNumber(data.latitude),
            longitude: sanitizeNumber(data.longitude),
            service_radius_km: sanitizeNumber(data.service_radius_km, 10) || 10,
            onboarding_submitted_at: new Date(),
            is_open: true,
            is_online: true,
          },
        },
      },
      include: { vendor: true },
    });

    await syncVendorDocuments(tx, account.vendor.id, data, 'vendor_registration');
    return account.vendor;
  });

  await recordAuditEntry({
    vendorId: vendor.id,
    userId: null,
    action: 'VENDOR_SELF_REGISTERED',
    entity: 'vendor',
    entityId: vendor.id,
    details: {
      email: normalizedEmail,
      business_name: vendor.business_name,
    },
  });

  const inboxEvents = require('../notifications/inbox.events');
  await inboxEvents.partnerApplication(vendor);

  return getVendorProfile(vendor.id);
}

async function getVendorProfile(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      account: { select: { email: true } },
      documents: {
        include: {
          reviews: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
        orderBy: { created_at: 'desc' },
      },
      operating_hours: {
        orderBy: { day_of_week: 'asc' },
      },
      service_areas: {
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      },
    },
  });

  if (!vendor) {
    throw new AppError('Vendor not found', 404);
  }

  return mapVendorProfile(vendor);
}

async function updateVendorProfile(vendorId, data) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { account: true },
  });

  if (!vendor) {
    throw new AppError('Vendor not found', 404);
  }

  const updateData = {};
  const accountUpdateData = {};
  const normalizedEmail = data.email ? normalizeEmail(data.email) : null;

  if (data.business_name) updateData.business_name = data.business_name;
  if (data.license_number) updateData.license_number = data.license_number;
  if (data.trade_license_url !== undefined) updateData.trade_license_url = data.trade_license_url || null;
  if (data.pharmacist_certificate_url !== undefined) updateData.pharmacist_certificate_url = data.pharmacist_certificate_url || null;
  if (data.ntn !== undefined) updateData.ntn = data.ntn || null;
  if (data.bank_account_title !== undefined) updateData.bank_account_title = data.bank_account_title || null;
  if (data.bank_account_number !== undefined) updateData.bank_account_number = data.bank_account_number || null;
  if (data.bank_name !== undefined) updateData.bank_name = data.bank_name || null;
  if (data.iban !== undefined) updateData.iban = data.iban || null;
  if (data.payout_schedule !== undefined) updateData.payout_schedule = data.payout_schedule || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp || null;
  if (data.logo_url !== undefined) updateData.logo_url = data.logo_url || null;
  if (data.province !== undefined) updateData.province = data.province || null;
  if (data.postal_code !== undefined) updateData.postal_code = data.postal_code || null;
  if (data.legal_business_name !== undefined) updateData.legal_business_name = data.legal_business_name || null;
  if (data.owner_name !== undefined) updateData.owner_name = data.owner_name || null;
  if (data.business_type !== undefined) updateData.business_type = data.business_type || null;
  if (data.license_expiry !== undefined) updateData.license_expiry = data.license_expiry ? new Date(data.license_expiry) : null;
  if (data.pickup_enabled !== undefined) updateData.pickup_enabled = Boolean(data.pickup_enabled);
  if (data.delivery_enabled !== undefined) updateData.delivery_enabled = Boolean(data.delivery_enabled);
  if (data.min_order_amount !== undefined) updateData.min_order_amount = sanitizeNumber(data.min_order_amount, 0);
  if (data.preparation_time_minutes !== undefined) {
    updateData.preparation_time_minutes = sanitizeNumber(data.preparation_time_minutes, 30);
  }
  if (data.notification_preferences !== undefined) updateData.notification_preferences = data.notification_preferences;
  if (data.address !== undefined) updateData.address = data.address || null;
  if (data.city !== undefined) updateData.city = data.city || null;
  if (data.latitude !== undefined) updateData.latitude = sanitizeNumber(data.latitude);
  if (data.longitude !== undefined) updateData.longitude = sanitizeNumber(data.longitude);
  if (data.service_radius_km !== undefined) updateData.service_radius_km = sanitizeNumber(data.service_radius_km, vendor.service_radius_km);
  if (data.is_open !== undefined) updateData.is_open = Boolean(data.is_open);
  if (data.is_online !== undefined) updateData.is_online = Boolean(data.is_online);
  if (data.holiday_mode_enabled !== undefined) updateData.holiday_mode_enabled = Boolean(data.holiday_mode_enabled);
  if (data.holiday_starts_at !== undefined) updateData.holiday_starts_at = data.holiday_starts_at ? new Date(data.holiday_starts_at) : null;
  if (data.holiday_ends_at !== undefined) updateData.holiday_ends_at = data.holiday_ends_at ? new Date(data.holiday_ends_at) : null;
  if (data.holiday_reason !== undefined) updateData.holiday_reason = data.holiday_reason || null;
  if (data.manual_online_override !== undefined) updateData.manual_online_override = data.manual_online_override === null ? null : Boolean(data.manual_online_override);

  if (normalizedEmail) {
    const existingAccount = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if (existingAccount && existingAccount.id !== vendor.account_id) {
      throw new AppError('Email already in use', 400);
    }
    updateData.email = normalizedEmail;
    if (vendor.account_id) {
      accountUpdateData.email = normalizedEmail;
    }
  }

  if (data.password) {
    const hashedPassword = await hashPassword(data.password);
    if (vendor.account_id) {
      accountUpdateData.password = hashedPassword;
    } else {
      updateData.password = hashedPassword;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (vendor.account_id && Object.keys(accountUpdateData).length > 0) {
      await tx.account.update({
        where: { id: vendor.account_id },
        data: accountUpdateData,
      });
    }

    await tx.vendor.update({
      where: { id: vendorId },
      data: updateData,
    });

    await syncVendorDocuments(tx, vendorId, data, 'vendor_profile');
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'VENDOR_PROFILE_UPDATED',
    entity: 'vendor',
    entityId: vendorId,
    details: {
      updated_fields: Object.keys(updateData),
    },
  });

  return getVendorProfile(vendorId);
}

async function getVendors(query) {
  const vendors = await prisma.vendor.findMany({
    where: {
      status: { in: ACTIVE_VENDOR_STATUSES },
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    },
    include: {
      operating_hours: true,
      service_areas: { where: { is_active: true } },
      _count: { select: { products: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return vendors
    .filter((vendor) => {
      const availability = computeVendorAvailability(vendor);
      if (query.delivery_city || query.delivery_area || query.delivery_zip) {
        return serviceAreaMatches(
          {
            city: query.delivery_city,
            area: query.delivery_area,
            zip: query.delivery_zip,
            street: query.delivery_street,
          },
          vendor.service_areas || []
        ) && availability.isAvailable;
      }
      return availability.isAvailable;
    })
    .map(({ _count, operating_hours, service_areas, ...vendor }) => ({
      ...vendor,
      product_count: _count.products,
      operating_hours,
      service_areas,
      availability: computeVendorAvailability({ ...vendor, operating_hours, service_areas }),
    }));
}

async function getMyProducts(vendorId, query = {}) {
  const productsService = require('../products/products.service');
  return productsService.listVendorProducts(vendorId, query);
}

function percentDelta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

async function getDashboardStats(vendorId) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
  const startOfLastMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, 1);
  const endOfLastMonth = new Date(startOfMonth.getTime() - 1);

  const validRevenueStatuses = ['pending', 'processing', 'shipped', 'delivered', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];

  const [orders, products, prescriptionOrders, assignmentLogs, notifications, operatingHours, vendorCore, earnings, expiringBatches] =
    await Promise.all([
      prisma.order.findMany({
        where: { vendor_id: vendorId },
        include: {
          items: { include: { product: { select: { id: true, name: true, price: true, category: true } } } },
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.product.findMany({
        where: { vendor_id: vendorId, deleted_at: null },
        include: { inventory: true, batches: true },
      }),
      prisma.prescriptionOrder.findMany({
        where: {
          OR: [{ assigned_vendor_id: vendorId }, { current_vendor_id: vendorId }],
        },
        include: { customer: { select: { name: true } }, items: true },
        orderBy: { created_at: 'asc' },
      }),
      prisma.prescriptionAssignmentLog.findMany({
        where: { vendor_id: vendorId },
        orderBy: { created_at: 'asc' },
      }),
      prisma.vendorNotification.count({
        where: { vendor_id: vendorId, status: 'unread' },
      }),
      prisma.vendorOperatingHour.findMany({
        where: { vendor_id: vendorId },
        orderBy: { day_of_week: 'asc' },
      }),
      prisma.vendor.findUnique({
        where: { id: vendorId },
        include: { documents: true },
      }),
      getVendorEarningsSummary(vendorId),
      prisma.inventoryBatch.findMany({
        where: {
          vendor_id: vendorId,
          expiry_date: { lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
        },
        include: { product: { select: { name: true } } },
        orderBy: { expiry_date: 'asc' },
        take: 8,
      }),
    ]);

  const revenueOrders = orders.filter((order) => validRevenueStatuses.includes(order.status));
  const totalRevenue = revenueOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const lastMonthRevenue = revenueOrders
    .filter((order) => {
      const created = new Date(order.created_at);
      return created >= startOfLastMonth && created <= endOfLastMonth;
    })
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const thisMonthRevenue = revenueOrders
    .filter((order) => new Date(order.created_at) >= startOfMonth)
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const ordersToday = orders.filter((order) => new Date(order.created_at) >= startOfToday).length;
  const ordersYesterday = orders.filter((order) => {
    const created = new Date(order.created_at);
    return created >= startOfYesterday && created < startOfToday;
  }).length;

  const activeProducts = products.filter(
    (product) =>
      product.approval_status === 'approved' &&
      String(product.listing_status || 'ACTIVE').toUpperCase() === 'ACTIVE'
  ).length;
  const lowStockList = products.filter((product) => {
    const available = product.inventory?.available_quantity ?? product.stock;
    return available <= Number(product.low_stock_threshold ?? 10);
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap = {};
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyMap[key] = { name: monthNames[date.getMonth()], revenue: 0, orders: 0 };
  }

  for (const order of revenueOrders) {
    const created = new Date(order.created_at);
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    if (monthlyMap[key]) {
      monthlyMap[key].revenue += Number(order.total_amount || 0);
      monthlyMap[key].orders += 1;
    }
  }

  const productSales = {};
  const categorySales = {};
  for (const order of revenueOrders) {
    for (const item of order.items || []) {
      const name = item.product?.name || 'Unknown';
      if (!productSales[name]) productSales[name] = { name, sales: 0, revenue: 0 };
      productSales[name].sales += item.quantity;
      productSales[name].revenue += Number(item.unit_price || 0) * item.quantity;
      const category = item.product?.category || 'Other';
      categorySales[category] = (categorySales[category] || 0) + Number(item.unit_price || 0) * item.quantity;
    }
  }

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map((product, index) => ({ ...product, rank: index + 1 }));

  const pendingOrders = orders.filter((order) => ['pending', 'NEW'].includes(order.status)).length;
  const processingOrders = orders.filter((order) =>
    ['processing', 'shipped', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'].includes(order.status)
  ).length;
  const completedToday = orders.filter(
    (order) => ['delivered', 'DELIVERED', 'COMPLETED'].includes(order.status) && new Date(order.updated_at) >= startOfToday
  ).length;
  const cancelledOrders = orders.filter((order) => ['cancelled', 'CANCELLED', 'REJECTED'].includes(order.status)).length;

  const responseMap = {};
  for (const log of assignmentLogs) {
    if (!responseMap[log.prescription_order_id]) {
      responseMap[log.prescription_order_id] = { offered: null, responded: null };
    }
    if (log.action === 'offered' && !responseMap[log.prescription_order_id].offered) {
      responseMap[log.prescription_order_id].offered = new Date(log.created_at);
    }
    if (['accepted', 'declined', 'timeout'].includes(log.action) && !responseMap[log.prescription_order_id].responded) {
      responseMap[log.prescription_order_id].responded = new Date(log.created_at);
    }
  }
  const responseTimes = Object.values(responseMap)
    .filter((entry) => entry.offered && entry.responded)
    .map((entry) => Math.round((entry.responded - entry.offered) / 60000));
  const averageResponseMinutes = responseTimes.length
    ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
    : 0;

  const acceptedAssignments = assignmentLogs.filter((log) => log.action === 'accepted').length;
  const actionableAssignments = assignmentLogs.filter((log) =>
    ['accepted', 'declined', 'timeout'].includes(log.action)
  ).length;
  const prescriptionAcceptanceRate = actionableAssignments
    ? Math.round((acceptedAssignments / actionableAssignments) * 100)
    : 0;

  const revenueDelta = percentDelta(thisMonthRevenue || totalRevenue, lastMonthRevenue);
  const ordersDelta = percentDelta(ordersToday, ordersYesterday);

  return {
    totalRevenue,
    ordersToday,
    activeProducts,
    lowStock: lowStockList.length,
    unreadNotifications: notifications,
    totalOrders: orders.length,
    comparisons: {
      totalRevenue: revenueDelta == null ? 'after fees' : `${revenueDelta >= 0 ? '↑' : '↓'} ${Math.abs(revenueDelta)}% vs last month`,
      totalRevenuePositive: revenueDelta == null ? true : revenueDelta >= 0,
      ordersToday: ordersDelta == null ? `${ordersToday} today` : `${ordersDelta >= 0 ? '↑' : '↓'} ${Math.abs(ordersDelta)}% vs yesterday`,
      ordersTodayPositive: ordersDelta == null ? true : ordersDelta >= 0,
      activeProducts: `${activeProducts} listed`,
      lowStock: `${lowStockList.length} low stock`,
      rxAcceptance: `${prescriptionAcceptanceRate}% accepted`,
      avgResponse: `${formatDuration(averageResponseMinutes)} avg`,
      netEarnings: 'after fees',
    },
    monthlyPerformance: Object.values(monthlyMap),
    categorySales: Object.entries(categorySales).map(([name, value]) => ({ name, value })),
    topProducts,
    recentOrders: orders.slice(0, 5).map((order) => ({
      id: order.id,
      order_number: order.order_number || `MZ-${String(order.id).slice(0, 8).toUpperCase()}`,
      customer: order.customer?.name || 'Customer',
      items: order.items?.length || 0,
      status: order.status,
      amount: order.total_amount,
      created_at: order.created_at,
    })),
    lowStockAlerts: lowStockList.slice(0, 6).map((product) => ({
      id: product.id,
      name: product.name,
      stock: product.inventory?.available_quantity ?? product.stock,
      threshold: product.low_stock_threshold,
    })),
    expiringSoon: expiringBatches.map((batch) => ({
      id: batch.id,
      product: batch.product?.name,
      expiry_date: batch.expiry_date,
      quantity: batch.quantity_available,
    })),
    prescriptionQueue: prescriptionOrders
      .filter((order) => ['finding_vendor', 'awaiting_accept', 'stock_check', 'PENDING_REVIEW', 'UNDER_REVIEW'].includes(order.status) || order.current_vendor_id === vendorId)
      .slice(0, 5)
      .map((order) => ({
        id: order.id,
        patient: order.customer?.name || 'Patient',
        items: order.items?.length || order.medicine_count || 0,
        status: order.status,
        created_at: order.created_at,
      })),
    orderSummary: {
      pending: pendingOrders,
      outForDelivery: processingOrders,
      completedToday,
      cancelled: cancelledOrders,
    },
    performance: {
      prescriptionAssignments: assignmentLogs.filter((log) => log.action === 'offered').length,
      prescriptionAcceptanceRate,
      averageResponseMinutes,
      averageResponseLabel: formatDuration(averageResponseMinutes),
      completedPrescriptionOrders: prescriptionOrders.filter((order) => order.status === 'delivered').length,
    },
    availability: computeVendorAvailability({
      ...vendorCore,
      operating_hours: operatingHours,
    }),
    earnings: earnings.totals,
    compliance_alerts: mapVendorProfile(vendorCore)?.compliance_alerts || [],
  };
}

async function getOnboardingStatus(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      documents: {
        include: {
          reviews: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!vendor) {
    throw new AppError('Vendor application not found', 404);
  }

  return {
    application_id: vendor.id,
    status: vendor.status,
    onboarding_submitted_at: vendor.onboarding_submitted_at,
    approved_at: vendor.approved_at,
    can_login: ACTIVE_VENDOR_STATUSES.includes(vendor.status),
    documents: mapDocumentSummary(vendor.documents || []),
  };
}

async function getVendorOperatingHours(vendorId) {
  return prisma.vendorOperatingHour.findMany({
    where: { vendor_id: vendorId },
    orderBy: { day_of_week: 'asc' },
  });
}

async function updateVendorOperatingHours(vendorId, hours = []) {
  await prisma.$transaction(async (tx) => {
    await tx.vendorOperatingHour.deleteMany({ where: { vendor_id: vendorId } });
    if (hours.length) {
      await tx.vendorOperatingHour.createMany({
        data: hours.map((entry) => ({
          vendor_id: vendorId,
          day_of_week: Number(entry.day_of_week),
          open_time: entry.open_time || null,
          close_time: entry.close_time || null,
          is_closed: Boolean(entry.is_closed),
        })),
      });
    }
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'VENDOR_OPERATING_HOURS_UPDATED',
    entity: 'vendor',
    entityId: vendorId,
    details: { day_count: hours.length },
  });

  return getVendorOperatingHours(vendorId);
}

async function getVendorServiceAreas(vendorId) {
  return prisma.vendorServiceArea.findMany({
    where: { vendor_id: vendorId },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
  });
}

async function updateVendorServiceAreas(vendorId, areas = []) {
  await prisma.$transaction(async (tx) => {
    await tx.vendorServiceArea.deleteMany({ where: { vendor_id: vendorId } });
    if (areas.length) {
      await tx.vendorServiceArea.createMany({
        data: areas.map((area, index) => ({
          vendor_id: vendorId,
          name: area.name,
          city: area.city || null,
          postal_codes: area.postal_codes || [],
          is_active: area.is_active !== false,
          sort_order: area.sort_order ?? index,
        })),
      });
    }
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'VENDOR_SERVICE_AREAS_UPDATED',
    entity: 'vendor',
    entityId: vendorId,
    details: { area_count: areas.length },
  });

  return getVendorServiceAreas(vendorId);
}

async function getVendorAvailability(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      operating_hours: true,
      service_areas: true,
    },
  });

  if (!vendor) throw new AppError('Vendor not found', 404);

  return {
    ...computeVendorAvailability(vendor),
    is_open: vendor.is_open,
    is_online: vendor.is_online,
    service_radius_km: vendor.service_radius_km,
    holiday_mode_enabled: vendor.holiday_mode_enabled,
    holiday_starts_at: vendor.holiday_starts_at,
    holiday_ends_at: vendor.holiday_ends_at,
    holiday_reason: vendor.holiday_reason,
    manual_online_override: vendor.manual_online_override,
    operating_hours: vendor.operating_hours,
    service_areas: vendor.service_areas,
  };
}

async function updateVendorAvailability(vendorId, data) {
  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...(data.is_open !== undefined ? { is_open: Boolean(data.is_open) } : {}),
      ...(data.is_online !== undefined ? { is_online: Boolean(data.is_online) } : {}),
      ...(data.service_radius_km !== undefined
        ? { service_radius_km: sanitizeNumber(data.service_radius_km, 10) || 10 }
        : {}),
      ...(data.holiday_mode_enabled !== undefined ? { holiday_mode_enabled: Boolean(data.holiday_mode_enabled) } : {}),
      ...(data.holiday_starts_at !== undefined
        ? { holiday_starts_at: data.holiday_starts_at ? new Date(data.holiday_starts_at) : null }
        : {}),
      ...(data.holiday_ends_at !== undefined
        ? { holiday_ends_at: data.holiday_ends_at ? new Date(data.holiday_ends_at) : null }
        : {}),
      ...(data.holiday_reason !== undefined ? { holiday_reason: data.holiday_reason || null } : {}),
      ...(data.manual_online_override !== undefined
        ? {
            manual_online_override:
              data.manual_online_override === null ? null : Boolean(data.manual_online_override),
          }
        : {}),
    },
  });

  await recordAuditEntry({
    vendorId,
    userId: vendorId,
    action: 'VENDOR_AVAILABILITY_UPDATED',
    entity: 'vendor',
    entityId: vendorId,
    details: data,
  });

  return getVendorAvailability(vendorId);
}

async function getVendorAnalyticsOverview(vendorId) {
  const [stats, earnings] = await Promise.all([
    getDashboardStats(vendorId),
    getVendorEarningsSummary(vendorId),
  ]);

  return {
    stats,
    earnings: earnings.totals,
  };
}

async function getVendorPerformanceMetrics(vendorId) {
  const stats = await getDashboardStats(vendorId);
  return {
    performance: stats.performance,
    orderSummary: stats.orderSummary,
    unreadNotifications: stats.unreadNotifications,
  };
}

async function listVendorAuditLogs(vendorId) {
  return prisma.vendorAuditLog.findMany({
    where: { vendor_id: vendorId },
    orderBy: { created_at: 'desc' },
    take: 200,
  });
}

module.exports = {
  registerVendor,
  getVendorProfile,
  updateVendorProfile,
  getVendors,
  getMyProducts,
  getDashboardStats,
  getOnboardingStatus,
  getVendorOperatingHours,
  updateVendorOperatingHours,
  getVendorServiceAreas,
  updateVendorServiceAreas,
  getVendorAvailability,
  updateVendorAvailability,
  getVendorAnalyticsOverview,
  getVendorPerformanceMetrics,
  getVendorEarningsSummary,
  listVendorSettlements,
  listVendorAuditLogs,
};
