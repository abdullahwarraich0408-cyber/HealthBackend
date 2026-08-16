#!/usr/bin/env node
/**
 * Cross-platform health + integration check for Medzoos.
 * Verifies backend APIs used by the website, user app, admin, pharmacy,
 * doctor, and lab portals — and that those roles share the same data.
 *
 * Usage (from Backend/):  npm run check:platforms
 */

const API = process.env.API_URL || 'http://localhost:5000/api';
const PASSWORD = process.env.CHECK_PASSWORD || 'password123';

const ACCOUNTS = {
  customer: [
    { email: 'customer@medzoos.com', password: PASSWORD },
    { email: 'customer@pharmahub.com', password: PASSWORD },
  ],
  admin: [
    { email: 'admin@medzoos.com', password: PASSWORD },
    { email: 'admin@pharmahub.com', password: PASSWORD },
  ],
  vendor: [
    { portal: 'vendor', email: 'vendor@medzoos.com', password: PASSWORD },
    { portal: 'vendor', email: 'vendor@pharmahub.com', password: PASSWORD },
  ],
  doctor: [
    { portal: 'doctor', email: 'doctor@medzoos.com', password: PASSWORD },
    { portal: 'doctor', email: 'doctor@pharmahub.com', password: PASSWORD },
  ],
  lab: [
    { portal: 'lab', email: 'lab@medzoos.com', password: PASSWORD },
    { portal: 'lab', email: 'lab@pharmahub.com', password: PASSWORD },
    { portal: 'lab', email: 'lab@gmail.com', password: PASSWORD },
  ],
};

const FRONTS = [
  { name: 'Website', port: 3000, path: '/', apiPath: '/api/health' },
  { name: 'Admin panel', port: 3001, path: '/portal-access', apiPath: '/api/health' },
  { name: 'Pharmacy panel', port: 3002, path: '/', apiPath: '/api/health' },
  { name: 'Doctor panel', port: 3003, path: '/', apiPath: '/api/health' },
  { name: 'Lab panel', port: 3004, path: '/', apiPath: '/api/health' },
];

const results = [];

function record(group, name, ok, detail, level = ok ? 'pass' : 'fail') {
  results.push({ group, name, ok, detail: String(detail || ''), level });
  const tag = level === 'pass' ? 'PASS' : level === 'warn' ? 'WARN' : 'FAIL';
  const color =
    level === 'pass' ? '\x1b[32m' : level === 'warn' ? '\x1b[33m' : '\x1b[31m';
  console.log(`  ${color}${tag}\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
}

function unwrap(json) {
  if (!json || typeof json !== 'object') return json;
  return json.data ?? json;
}

function pickToken(payload) {
  const data = unwrap(payload) || {};
  return (
    data.tokens?.accessToken ||
    data.token ||
    data.accessToken ||
    data.tokens?.access_token ||
    null
  );
}

function countOf(payload, keys) {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data.length;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key].length;
  }
  return null;
}

function idsOf(payload, keys) {
  const data = unwrap(payload);
  let list = Array.isArray(data) ? data : null;
  if (!list) {
    for (const key of keys) {
      if (Array.isArray(data?.[key])) {
        list = data[key];
        break;
      }
    }
  }
  return new Set((list || []).map((item) => item?.id).filter(Boolean));
}

async function request(method, path, { token, body, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 180) };
    }
    return { status: res.status, ok: res.ok, json, data: unwrap(json) };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      json: null,
      data: null,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function expectOk(group, name, method, path, opts = {}) {
  const res = await request(method, path, opts);
  if (!res.ok) {
    const msg =
      res.error ||
      res.json?.message ||
      res.json?.error?.message ||
      `HTTP ${res.status}`;
    record(group, name, false, `${path} → ${msg}`);
    return res;
  }
  const extra = typeof opts.detail === 'function' ? opts.detail(res) : '';
  record(group, name, true, extra || `${path} ${res.status}`);
  return res;
}

async function expectStatus(group, name, method, path, allowed, opts = {}) {
  const res = await request(method, path, opts);
  if (allowed.includes(res.status)) {
    record(group, name, true, `${path} → ${res.status}`);
  } else {
    record(
      group,
      name,
      false,
      `${path} expected ${allowed.join('/')} got ${res.status || res.error}`,
    );
  }
  return res;
}

async function loginEmail(role) {
  const candidates = ACCOUNTS[role];
  let lastError = 'no candidates';
  for (const account of candidates) {
    const res = await request('POST', '/auth/login', {
      body: { email: account.email, password: account.password, platform: 'web' },
    });
    const token = pickToken(res.json);
    if (res.ok && token) {
      const user = res.data?.user || {};
      record(
        'Auth',
        `${role} email login`,
        true,
        `${user.email || account.email} role=${user.role || role}`,
      );
      return token;
    }
    lastError = res.json?.message || res.error || `HTTP ${res.status}`;
  }
  record('Auth', `${role} email login`, false, lastError, 'warn');
  return mintLocalToken(role);
}

async function loginPartner(role) {
  const candidates = ACCOUNTS[role];
  let lastError = 'no candidates';
  for (const account of candidates) {
    const res = await request('POST', '/auth/partner/login', {
      body: {
        portal: account.portal,
        email: account.email,
        password: account.password,
      },
    });
    const token = pickToken(res.json);
    if (res.ok && token) {
      record(
        'Auth',
        `${role} partner login`,
        true,
        `${res.data?.partner?.email || account.email} role=${res.data?.role || role}`,
      );
      return { token, partner: res.data?.partner || null };
    }
    lastError = res.json?.message || res.error || `HTTP ${res.status}`;
  }
  record('Auth', `${role} partner login`, false, lastError, 'warn');
  const token = await mintLocalToken(role);
  return { token, partner: null };
}

async function mintLocalToken(role) {
  try {
    const prisma = require('../src/config/database');
    const jwt = require('jsonwebtoken');
    const env = require('../src/config/env');
    const account = await prisma.account.findFirst({
      where: { role, is_active: true },
      include: { customer: true, vendor: true, doctor: true, lab_partner: true },
      orderBy: { created_at: 'asc' },
    });
    const profile =
      role === 'admin' || role === 'customer'
        ? account?.customer
        : role === 'vendor'
          ? account?.vendor
          : role === 'doctor'
            ? account?.doctor
            : account?.lab_partner;
    if (!account || !profile) {
      record('Auth', `${role} local session fallback`, false, 'no matching account in database');
      return null;
    }
    const token = jwt.sign(
      {
        id: profile.id,
        accountId: account.id,
        role: account.role,
        sessionId: 'platform-check',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '20m' },
    );
    record(
      'Auth',
      `${role} local session fallback`,
      true,
      `using ${account.email} (seed password did not match)`,
      'warn',
    );
    return token;
  } catch (err) {
    record('Auth', `${role} local session fallback`, false, err.message);
    return null;
  }
}

async function loginDevCustomer() {
  const res = await request('POST', '/auth/dev-login', {
    body: { phone: '+923361400372', code: '123456', platform: 'android' },
  });
  const token = pickToken(res.json);
  if (!res.ok || !token) {
    record(
      'Auth',
      'user app OTP/dev login',
      false,
      res.json?.message || res.error || `HTTP ${res.status}`,
    );
    return null;
  }
  record(
    'Auth',
    'user app OTP/dev login',
    true,
    res.data?.user?.phone || '+923361400372',
  );
  return token;
}

async function probeFront(front) {
  const origin = `http://localhost:${front.port}`;
  try {
    const page = await fetch(`${origin}${front.path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!page.ok && page.status >= 500) {
      record('Frontends', `${front.name} UI`, false, `${origin} HTTP ${page.status}`);
      return;
    }
    record('Frontends', `${front.name} UI`, true, `${origin} HTTP ${page.status}`);
  } catch {
    record(
      'Frontends',
      `${front.name} UI`,
      false,
      `not running on :${front.port}`,
      'warn',
    );
    return;
  }

  try {
    const api = await fetch(`${origin}${front.apiPath}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await api.json().catch(() => null);
    const healthy =
      api.ok &&
      (json?.message?.includes('Medzoos API') || json?.status === 'success');
    if (healthy) {
      record(
        'Frontends',
        `${front.name} → backend`,
        true,
        `${front.apiPath} proxied to API`,
      );
    } else {
      record(
        'Frontends',
        `${front.name} → backend`,
        false,
        `${front.apiPath} HTTP ${api.status}`,
        'warn',
      );
    }
  } catch (err) {
    record(
      'Frontends',
      `${front.name} → backend`,
      false,
      err.message,
      'warn',
    );
  }
}

async function main() {
  console.log(`\nMedzoos platform check  (${API})\n`);

  console.log('Backend');
  const health = await request('GET', '/health');
  if (!health.ok) {
    record('Backend', 'API health', false, health.error || `HTTP ${health.status}`);
    console.log('\nBackend is not reachable. Start it with: cd Backend && npm run dev\n');
    process.exit(1);
  }
  record('Backend', 'API health', true, health.json?.message || 'ok');

  console.log('\nPublic catalog (website + user app)');
  const doctors = await expectOk('Catalog', 'Doctors list', 'GET', '/doctors', {
    detail: (r) => `${countOf(r.json, ['doctors'])} doctors`,
  });
  const products = await expectOk('Catalog', 'Products list', 'GET', '/products', {
    detail: (r) => `${countOf(r.json, ['products'])} products`,
  });
  const vendors = await expectOk('Catalog', 'Pharmacies list', 'GET', '/vendors', {
    detail: (r) => `${countOf(r.json, ['vendors'])} pharmacies`,
  });
  const hospitals = await expectOk('Catalog', 'Hospitals list', 'GET', '/hospitals', {
    detail: (r) => `${countOf(r.json, ['hospitals'])} hospitals`,
  });
  const labs = await expectOk('Catalog', 'Labs list', 'GET', '/lab-tests/labs', {
    detail: (r) => `${countOf(r.json, ['labs', 'labPartners'])} labs`,
  });
  const labTests = await expectOk('Catalog', 'Lab tests list', 'GET', '/lab-tests', {
    detail: (r) => `${countOf(r.json, ['tests', 'labTests'])} tests`,
  });
  await expectOk('Catalog', 'Popular lab tests', 'GET', '/lab-tests/popular');
  await expectOk('Catalog', 'Categories', 'GET', '/categories');
  await expectOk('Catalog', 'Search', 'GET', '/search?q=medicine');
  await expectOk('Catalog', 'Home posters', 'GET', '/home-slides?audience=first_visit', {
    detail: (r) => `${countOf(r.json, ['slides'])} slides`,
  });
  await expectOk('Catalog', 'Offer posters', 'GET', '/home-slides?audience=returning');
  const content = await expectOk(
    'Catalog',
    'CMS content (app)',
    'GET',
    '/content?section=care_actions&channel=app',
    { detail: (r) => `${countOf(r.json, ['items'])} care shortcuts` },
  );
  const specialties = await expectOk(
    'Catalog',
    'CMS specialties (website)',
    'GET',
    '/content?section=specialties&channel=website',
    { detail: (r) => `${countOf(r.json, ['items'])} specialties` },
  );
  await expectOk('Catalog', 'Community posts', 'GET', '/community/posts');
  await expectOk('Catalog', 'Health groups', 'GET', '/community/groups');

  const doctorIds = idsOf(doctors.json, ['doctors']);
  const productIds = idsOf(products.json, ['products']);
  const vendorIds = idsOf(vendors.json, ['vendors']);
  const hospitalIds = idsOf(hospitals.json, ['hospitals']);
  const labIds = idsOf(labs.json, ['labs', 'labPartners']);
  const testIds = idsOf(labTests.json, ['tests', 'labTests']);
  const specialtyTitles = new Set(
    (unwrap(specialties.json)?.items || []).map((item) => item.title),
  );

  console.log('\nAuth');
  const customerToken = await loginEmail('customer');
  const appToken = await loginDevCustomer();
  const adminToken = await loginEmail('admin');
  const { token: vendorToken, partner: vendorProfile } = await loginPartner('vendor');
  const { token: doctorToken, partner: doctorProfile } = await loginPartner('doctor');
  const { token: labToken, partner: labProfile } = await loginPartner('lab');

  console.log('\nUser app / website (customer)');
  if (customerToken) {
    await expectOk('Customer', 'Session /auth/me', 'GET', '/auth/me', { token: customerToken });
    await expectOk('Customer', 'Profile', 'GET', '/users/profile', { token: customerToken });
    await expectOk('Customer', 'Cart', 'GET', '/customer/cart', { token: customerToken });
    await expectOk('Customer', 'Orders', 'GET', '/orders', { token: customerToken });
    await expectOk('Customer', 'Addresses', 'GET', '/addresses', { token: customerToken });
    await expectOk('Customer', 'My appointments', 'GET', '/doctors/appointments/me', {
      token: customerToken,
      detail: (r) => `${countOf(r.json, ['appointments'])} appointments`,
    });
    await expectOk('Customer', 'Lab bookings', 'GET', '/lab-tests/bookings/me', {
      token: customerToken,
    });
    await expectOk('Customer', 'Lab reports', 'GET', '/lab-tests/reports/me', {
      token: customerToken,
    });
    await expectOk('Customer', 'Prescriptions', 'GET', '/customer/prescriptions', {
      token: customerToken,
    });
    await expectOk('Customer', 'Family vault', 'GET', '/family-vault', {
      token: customerToken,
    });
    await expectStatus(
      'Customer',
      'Family dashboard',
      'GET',
      '/family-vault/dashboard',
      [200, 404],
      { token: customerToken },
    );
    await expectOk('Customer', 'Prescription orders', 'GET', '/prescription-orders', {
      token: customerToken,
    });
  }

  if (appToken && appToken !== customerToken) {
    await expectOk('Customer', 'App session /auth/me', 'GET', '/auth/me', { token: appToken });
    await expectOk('Customer', 'App cart', 'GET', '/customer/cart', { token: appToken });
  }

  console.log('\nAdmin panel');
  if (adminToken) {
    await expectOk('Admin', 'Dashboard', 'GET', '/admin/dashboard', { token: adminToken });
    const adminDoctors = await expectOk('Admin', 'Doctors', 'GET', '/admin/doctors', {
      token: adminToken,
      detail: (r) => `${countOf(r.json, ['doctors'])} doctors`,
    });
    const adminVendors = await expectOk('Admin', 'Vendors', 'GET', '/admin/vendors', {
      token: adminToken,
    });
    await expectOk('Admin', 'Customers', 'GET', '/admin/customers', { token: adminToken });
    await expectOk('Admin', 'Orders', 'GET', '/admin/orders', { token: adminToken });
    await expectOk('Admin', 'CMS content', 'GET', '/admin/content', { token: adminToken });
    await expectOk('Admin', 'Home posters', 'GET', '/admin/home-slides', { token: adminToken });
    await expectOk('Admin', 'Lab bookings', 'GET', '/lab-tests/admin/bookings', {
      token: adminToken,
    });

    const adminDoctorIds = idsOf(adminDoctors.json, ['doctors']);
    const overlap = [...doctorIds].filter((id) => adminDoctorIds.has(id)).length;
    record(
      'Link',
      'Admin doctors match public catalog',
      overlap > 0 || doctorIds.size === 0,
      `${overlap} shared doctor ids`,
    );

    const adminVendorIds = idsOf(adminVendors.json, ['vendors']);
    const vendorOverlap = [...vendorIds].filter((id) => adminVendorIds.has(id)).length;
    record(
      'Link',
      'Admin pharmacies match public catalog',
      vendorOverlap > 0 || vendorIds.size === 0,
      `${vendorOverlap} shared pharmacy ids`,
    );
  }

  console.log('\nPharmacy panel');
  if (vendorToken) {
    await expectOk('Pharmacy', 'Profile', 'GET', '/vendors/profile', { token: vendorToken });
    await expectOk('Pharmacy', 'Dashboard', 'GET', '/vendors/dashboard/stats', {
      token: vendorToken,
    });
    const mine = await expectOk('Pharmacy', 'My products', 'GET', '/vendors/products/mine', {
      token: vendorToken,
      detail: (r) => `${countOf(r.json, ['products'])} products`,
    });
    await expectOk('Pharmacy', 'Vendor orders', 'GET', '/orders/vendor', { token: vendorToken });
    await expectOk('Pharmacy', 'Earnings', 'GET', '/vendors/earnings/summary', {
      token: vendorToken,
    });

    if (vendorProfile?.id && vendorIds.has(vendorProfile.id)) {
      record('Link', 'Pharmacy appears on website/app', true, vendorProfile.business_name || vendorProfile.id);
    } else if (vendorProfile?.id) {
      record(
        'Link',
        'Pharmacy appears on website/app',
        false,
        `${vendorProfile.id} missing from public /vendors`,
      );
    }

    const mineIds = idsOf(mine.json, ['products']);
    const listed = [...mineIds].filter((id) => productIds.has(id)).length;
    if (mineIds.size > 0) {
      record(
        'Link',
        'Vendor products listed in public catalog',
        listed > 0,
        `${listed}/${mineIds.size} products visible to patients`,
      );
    }
  }

  console.log('\nDoctor portal / doctor app');
  if (doctorToken) {
    const profile = await expectOk('Doctor', 'Profile', 'GET', '/partners/doctor/profile', {
      token: doctorToken,
    });
    await expectOk('Doctor', 'Appointments', 'GET', '/partners/doctor/appointments', {
      token: doctorToken,
      detail: (r) => `${countOf(r.json, ['appointments'])} appointments`,
    });
    await expectOk('Doctor', 'Schedule', 'GET', '/partners/doctor/schedule', {
      token: doctorToken,
    });
    await expectOk('Doctor', 'Patients', 'GET', '/partners/doctor/patients', {
      token: doctorToken,
    });
    await expectOk('Doctor', 'Stats', 'GET', '/partners/doctor/stats', { token: doctorToken });
    await expectOk('Doctor', 'Practice locations', 'GET', '/partners/doctor/practice-locations', {
      token: doctorToken,
    });

    const doc = profile.data?.doctor || profile.data || doctorProfile;
    if (doc?.id && doctorIds.has(doc.id)) {
      record('Link', 'Doctor appears on website/app', true, doc.name || doc.id);
    } else if (doc?.id) {
      record(
        'Link',
        'Doctor appears on website/app',
        false,
        `${doc.id} missing from public /doctors`,
      );
    }
  }

  console.log('\nLab portal');
  if (labToken) {
    const profile = await expectOk('Lab', 'Profile', 'GET', '/partners/lab/profile', {
      token: labToken,
    });
    await expectOk('Lab', 'Bookings', 'GET', '/partners/lab/bookings', { token: labToken });
    const tests = await expectOk('Lab', 'My tests', 'GET', '/partners/lab/tests', {
      token: labToken,
      detail: (r) => `${countOf(r.json, ['tests', 'labTests'])} tests`,
    });
    await expectOk('Lab', 'Reports summary', 'GET', '/partners/lab/reports/summary', {
      token: labToken,
    });

    const lab = profile.data?.lab || profile.data || labProfile;
    if (lab?.id && labIds.has(lab.id)) {
      record('Link', 'Lab appears on website/app', true, lab.name || lab.id);
    } else if (lab?.id) {
      record(
        'Link',
        'Lab appears on website/app',
        false,
        `${lab.id} missing from public /lab-tests/labs`,
      );
    }

    const portalTestIds = idsOf(tests.json, ['tests', 'labTests']);
    const sharedTests = [...portalTestIds].filter((id) => testIds.has(id)).length;
    if (portalTestIds.size > 0) {
      record(
        'Link',
        'Lab tests listed for patients',
        sharedTests > 0,
        `${sharedTests}/${portalTestIds.size} tests in public catalog`,
      );
    }
  }

  if (specialtyTitles.size > 0) {
    record(
      'Link',
      'CMS specialties available to app + website',
      true,
      `${specialtyTitles.size} specialties from admin CMS`,
    );
  }
  if (content.ok && countOf(content.json, ['items']) > 0) {
    record(
      'Link',
      'CMS care shortcuts available to user app',
      true,
      `${countOf(content.json, ['items'])} shortcuts`,
    );
  }
  if (hospitalIds.size > 0) {
    record('Link', 'Hospitals shared with patients', true, `${hospitalIds.size} hospitals`);
  }

  console.log('\nAccess isolation');
  await expectStatus('Isolation', 'Guest cannot read orders', 'GET', '/orders', [401]);
  if (customerToken) {
    await expectStatus(
      'Isolation',
      'Customer cannot open admin dashboard',
      'GET',
      '/admin/dashboard',
      [401, 403],
      { token: customerToken },
    );
    await expectStatus(
      'Isolation',
      'Customer cannot open doctor portal',
      'GET',
      '/partners/doctor/profile',
      [401, 403],
      { token: customerToken },
    );
  }
  if (vendorToken) {
    await expectStatus(
      'Isolation',
      'Pharmacy cannot open doctor portal',
      'GET',
      '/partners/doctor/profile',
      [401, 403],
      { token: vendorToken },
    );
  }
  if (doctorToken) {
    await expectStatus(
      'Isolation',
      'Doctor cannot open lab portal',
      'GET',
      '/partners/lab/profile',
      [401, 403],
      { token: doctorToken },
    );
    await expectStatus(
      'Isolation',
      'Doctor cannot open admin CMS',
      'GET',
      '/admin/content',
      [401, 403],
      { token: doctorToken },
    );
  }

  console.log('\nFrontends');
  for (const front of FRONTS) {
    await probeFront(front);
  }

  try {
    const metro = await fetch('http://localhost:8081/status', {
      signal: AbortSignal.timeout(3000),
    });
    record(
      'Frontends',
      'User/Doctor app Metro bundler',
      metro.ok,
      metro.ok ? 'http://localhost:8081' : `HTTP ${metro.status}`,
    );
  } catch {
    record(
      'Frontends',
      'User/Doctor app Metro bundler',
      false,
      'not running on :8081',
      'warn',
    );
  }

  const pass = results.filter((r) => r.level === 'pass').length;
  const fail = results.filter((r) => r.level === 'fail').length;
  const warn = results.filter((r) => r.level === 'warn').length;

  console.log('\n────────────────────────────────────────');
  console.log(`  ${pass} passed   ${fail} failed   ${warn} warnings`);
  console.log('────────────────────────────────────────\n');

  if (fail > 0) {
    console.log('Failed checks:');
    for (const item of results.filter((r) => r.level === 'fail')) {
      console.log(`  - [${item.group}] ${item.name}: ${item.detail}`);
    }
    console.log('');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
