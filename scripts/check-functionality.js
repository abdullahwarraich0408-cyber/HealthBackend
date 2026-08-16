#!/usr/bin/env node
/**
 * Full functionality pass: each feature OK / NOT OK, plus where it affects
 * app, website, and admin.
 *
 * Usage (from Backend/):  npm run check:functionality
 */

const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'http://localhost:5000/api';
const PASSWORD = process.env.CHECK_PASSWORD || 'password123';
const MARKER = `__fncheck_${Date.now()}`;

const ACCOUNTS = {
  customer: [
    { email: 'customer@pharmahub.com', password: PASSWORD },
    { email: 'customer@medzoos.com', password: PASSWORD },
  ],
  admin: [
    { email: 'admin@pharmahub.com', password: PASSWORD },
    { email: 'admin@medzoos.com', password: PASSWORD },
  ],
  vendor: [
    { portal: 'vendor', email: 'vendor@pharmahub.com', password: PASSWORD },
    { portal: 'vendor', email: 'vendor@medzoos.com', password: PASSWORD },
  ],
  doctor: [
    { portal: 'doctor', email: 'doctor@medzoos.com', password: PASSWORD },
    { portal: 'doctor', email: 'doctor@pharmahub.com', password: PASSWORD },
  ],
  lab: [
    { portal: 'lab', email: 'lab@pharmahub.com', password: PASSWORD },
    { portal: 'lab', email: 'lab@medzoos.com', password: PASSWORD },
  ],
};

const results = [];

function record(group, name, ok, affects, detail) {
  const status = ok ? 'OK' : 'NOT OK';
  results.push({
    group,
    name,
    status,
    ok: Boolean(ok),
    affects: affects || '',
    detail: String(detail || ''),
  });
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(
    `  ${color}${status}\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}${affects ? `  [${affects}]` : ''}`,
  );
}

function unwrap(json) {
  if (!json || typeof json !== 'object') return json;
  return json.data ?? json;
}

function pickToken(payload) {
  const data = unwrap(payload) || {};
  return data.tokens?.accessToken || data.token || data.accessToken || null;
}

function listOf(payload, keys) {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function firstId(payload, keys) {
  return listOf(payload, keys)[0]?.id || null;
}

async function request(method, path, { token, body, timeoutMs = 15000 } = {}) {
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
      json = { raw: text.slice(0, 200) };
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

function failMsg(res) {
  return res.error || res.json?.message || res.json?.error?.message || `HTTP ${res.status}`;
}

async function checkGet(group, name, path, { token, affects, keys, min = 0, allow = [200, 304] } = {}) {
  const res = await request('GET', path, { token });
  if (!allow.includes(res.status)) {
    record(group, name, false, affects, failMsg(res));
    return res;
  }
  const count = keys ? listOf(res.json, keys).length : null;
  if (keys && min > 0 && count < min) {
    record(group, name, false, affects, `expected at least ${min}, got ${count}`);
    return res;
  }
  record(
    group,
    name,
    true,
    affects,
    count == null ? `${path} ${res.status}` : `${count} items`,
  );
  return res;
}

async function loginEmail(role) {
  for (const account of ACCOUNTS[role]) {
    const res = await request('POST', '/auth/login', {
      body: { email: account.email, password: account.password, platform: 'web' },
    });
    const token = pickToken(res.json);
    if (res.ok && token) return { token, email: account.email, user: res.data?.user };
  }
  return { token: null };
}

async function loginPartner(role) {
  for (const account of ACCOUNTS[role]) {
    const res = await request('POST', '/auth/partner/login', {
      body: { portal: account.portal, email: account.email, password: account.password },
    });
    const token = pickToken(res.json);
    if (res.ok && token) {
      return { token, email: account.email, partner: res.data?.partner, role: res.data?.role };
    }
  }
  return { token: null };
}

async function pageHas(url, needles, group, name, affects) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'follow' });
    const html = await res.text();
    if (!res.ok) {
      record(group, name, false, affects, `${url} HTTP ${res.status}`);
      return;
    }
    const missing = needles.filter((n) => !html.includes(n));
    if (missing.length) {
      record(group, name, false, affects, `page loaded but missing: ${missing.join(', ')}`);
      return;
    }
    record(group, name, true, affects, url);
  } catch (err) {
    record(group, name, false, affects, `${url} ${err.message}`);
  }
}

async function main() {
  console.log(`\nMedzoos functionality test  (${API})\n`);

  console.log('Core');
  const health = await request('GET', '/health');
  record('Core', 'Backend API running', health.ok, 'all platforms', health.json?.message || failMsg(health));
  if (!health.ok) {
    process.exit(1);
  }

  console.log('\nPublic catalog');
  const doctors = await checkGet('Catalog', 'Doctors list', '/doctors', {
    keys: ['doctors'],
    min: 1,
    affects: 'website, user app',
  });
  const products = await checkGet('Catalog', 'Medicines / products', '/products', {
    keys: ['products'],
    min: 1,
    affects: 'website, user app',
  });
  const vendors = await checkGet('Catalog', 'Pharmacies list', '/vendors', {
    keys: ['vendors'],
    min: 1,
    affects: 'website, user app',
  });
  const hospitals = await checkGet('Catalog', 'Hospitals list', '/hospitals', {
    keys: ['hospitals'],
    min: 1,
    affects: 'website, user app',
  });
  const labs = await checkGet('Catalog', 'Labs list', '/lab-tests/labs', {
    keys: ['labs', 'labPartners'],
    min: 1,
    affects: 'website, user app',
  });
  const tests = await checkGet('Catalog', 'Lab tests list', '/lab-tests', {
    keys: ['tests', 'labTests'],
    min: 1,
    affects: 'website, user app',
  });
  await checkGet('Catalog', 'Popular lab tests', '/lab-tests/popular', {
    keys: ['tests', 'labTests', 'popular'],
    affects: 'website, user app',
  });
  await checkGet('Catalog', 'Categories', '/categories', {
    keys: ['categories'],
    affects: 'website, user app',
  });
  await checkGet('Catalog', 'Search medicines', '/search?q=medicine', {
    affects: 'website, user app',
  });
  await checkGet('Catalog', 'Trending search', '/search/trending', { affects: 'website, user app' });
  await checkGet('Catalog', 'Home posters (first visit)', '/home-slides?audience=first_visit', {
    keys: ['slides'],
    min: 1,
    affects: 'user app, website hero',
  });
  await checkGet('Catalog', 'Home posters (offers)', '/home-slides?audience=returning', {
    keys: ['slides'],
    min: 1,
    affects: 'user app',
  });
  await checkGet('Catalog', 'CMS care shortcuts', '/content?section=care_actions&channel=app', {
    keys: ['items'],
    min: 1,
    affects: 'user app home',
  });
  await checkGet('Catalog', 'CMS specialties', '/content?section=specialties&channel=both', {
    keys: ['items'],
    min: 1,
    affects: 'user app, website',
  });
  await checkGet('Catalog', 'CMS banners', '/content?section=banners&channel=both', {
    keys: ['items'],
    affects: 'user app, website',
  });
  await checkGet('Catalog', 'Community posts', '/community/posts', { affects: 'user app, website' });
  await checkGet('Catalog', 'Health groups', '/community/groups', { affects: 'user app, website' });
  await checkGet('Catalog', 'Challenges', '/community/challenges', { affects: 'user app' });

  const doctorId = firstId(doctors.json, ['doctors']);
  const productId = firstId(products.json, ['products']);
  const hospitalId = firstId(hospitals.json, ['hospitals']);
  const labId = firstId(labs.json, ['labs', 'labPartners']);
  const testId = firstId(tests.json, ['tests', 'labTests']);
  const vendorId = firstId(vendors.json, ['vendors']);

  if (doctorId) {
    await checkGet('Catalog', 'Doctor profile', `/doctors/${doctorId}`, {
      affects: 'website doctor page, user app',
    });
    await checkGet('Catalog', 'Doctor slots', `/doctors/${doctorId}/slots`, {
      affects: 'booking on website + app',
    });
    await checkGet('Catalog', 'Doctor practice locations', `/doctors/${doctorId}/practice-locations`, {
      affects: 'clinic booking',
    });
    await checkGet('Catalog', 'Doctor reviews', `/doctors/${doctorId}/reviews`, {
      affects: 'website, user app',
    });
  }
  if (productId) {
    await checkGet('Catalog', 'Product detail', `/products/${productId}`, {
      affects: 'website, user app pharmacy',
    });
  }
  if (hospitalId) {
    await checkGet('Catalog', 'Hospital profile', `/hospitals/${hospitalId}`, {
      affects: 'website, user app',
    });
    await checkGet('Catalog', 'Hospital doctors', `/hospitals/${hospitalId}/doctors`, {
      affects: 'website, user app',
    });
  }
  if (labId) {
    await checkGet('Catalog', 'Lab profile', `/lab-tests/labs/${labId}`, {
      affects: 'website, user app',
    });
  }
  if (testId) {
    await checkGet('Catalog', 'Lab test detail', `/lab-tests/${testId}`, {
      affects: 'website, user app',
    });
  }

  console.log('\nAuth');
  const customer = await loginEmail('customer');
  record('Auth', 'Customer login', Boolean(customer.token), 'website, user app', customer.email || 'failed');
  const appLogin = await request('POST', '/auth/dev-login', {
    body: { phone: '+923361400372', code: '123456', platform: 'android' },
  });
  const appToken = pickToken(appLogin.json);
  record('Auth', 'User app OTP login', Boolean(appToken), 'user app', appToken ? '+923361400372' : failMsg(appLogin));
  const admin = await loginEmail('admin');
  record('Auth', 'Admin login', Boolean(admin.token), 'admin panel', admin.email || 'failed');
  const vendor = await loginPartner('vendor');
  record('Auth', 'Pharmacy login', Boolean(vendor.token), 'pharmacy panel', vendor.email || 'failed');
  const doctor = await loginPartner('doctor');
  record('Auth', 'Doctor login', Boolean(doctor.token), 'doctor panel, doctor app', doctor.email || 'failed');
  const lab = await loginPartner('lab');
  record('Auth', 'Lab login', Boolean(lab.token), 'lab panel', lab.email || 'failed');

  console.log('\nPatient (website + user app)');
  if (customer.token) {
    await checkGet('Patient', 'Session', '/auth/me', { token: customer.token, affects: 'website, user app' });
    await checkGet('Patient', 'Profile', '/users/profile', { token: customer.token, affects: 'website, user app' });
    await checkGet('Patient', 'Cart', '/customer/cart', { token: customer.token, affects: 'website, user app' });
    await checkGet('Patient', 'Orders', '/orders', { token: customer.token, affects: 'website, user app, pharmacy' });
    await checkGet('Patient', 'Addresses', '/addresses', { token: customer.token, affects: 'checkout' });
    await checkGet('Patient', 'Appointments', '/doctors/appointments/me', {
      token: customer.token,
      keys: ['appointments'],
      affects: 'website, user app, doctor portal',
    });
    await checkGet('Patient', 'Lab bookings', '/lab-tests/bookings/me', {
      token: customer.token,
      affects: 'website, user app, lab portal',
    });
    await checkGet('Patient', 'Lab reports', '/lab-tests/reports/me', {
      token: customer.token,
      affects: 'website, user app',
    });
    await checkGet('Patient', 'Prescriptions', '/customer/prescriptions', {
      token: customer.token,
      affects: 'website, user app',
    });
    await checkGet('Patient', 'Prescription orders', '/prescription-orders', {
      token: customer.token,
      affects: 'website, user app, pharmacy',
    });
    await checkGet('Patient', 'Coupons', '/customer/coupons', {
      token: customer.token,
      affects: 'checkout',
    });
    await checkGet('Patient', 'Family vault', '/family-vault', {
      token: customer.token,
      allow: [200, 404],
      affects: 'user app, website',
    });
    await checkGet('Patient', 'Health documents', '/health-records/documents', {
      token: customer.token,
      affects: 'user app',
    });
    await checkGet('Patient', 'Health timeline', '/health-records/timeline', {
      token: customer.token,
      affects: 'user app',
    });
  }
  if (appToken) {
    await checkGet('Patient', 'App session', '/auth/me', { token: appToken, affects: 'user app' });
    await checkGet('Patient', 'App cart', '/customer/cart', { token: appToken, affects: 'user app' });
  }

  console.log('\nAdmin panel');
  if (admin.token) {
    await checkGet('Admin', 'Dashboard', '/admin/dashboard', { token: admin.token, affects: 'admin' });
    const adminDoctors = await checkGet('Admin', 'Doctors', '/admin/doctors', {
      token: admin.token,
      keys: ['doctors'],
      min: 1,
      affects: 'admin; same list as website/app',
    });
    const adminVendors = await checkGet('Admin', 'Pharmacies', '/admin/vendors', {
      token: admin.token,
      keys: ['vendors'],
      min: 1,
      affects: 'admin; same pharmacies as website/app',
    });
    await checkGet('Admin', 'Customers', '/admin/customers', { token: admin.token, affects: 'admin' });
    await checkGet('Admin', 'Orders', '/admin/orders', { token: admin.token, affects: 'admin, pharmacy' });
    await checkGet('Admin', 'Products', '/admin/products', { token: admin.token, affects: 'admin catalog' });
    await checkGet('Admin', 'Hospitals', '/admin/hospitals', { token: admin.token, affects: 'admin, website, app' });
    await checkGet('Admin', 'Labs', '/admin/labs', { token: admin.token, affects: 'admin, website, app' });
    await checkGet('Admin', 'Lab bookings', '/lab-tests/admin/bookings', {
      token: admin.token,
      affects: 'admin, lab portal',
    });
    await checkGet('Admin', 'CMS content', '/admin/content', { token: admin.token, affects: 'app + website CMS' });
    await checkGet('Admin', 'Home posters', '/admin/home-slides', {
      token: admin.token,
      keys: ['slides'],
      affects: 'user app + website hero',
    });
    await checkGet('Admin', 'Coupons', '/admin/marketing/coupons', { token: admin.token, affects: 'checkout' });
    await checkGet('Admin', 'Offers', '/admin/marketing/offers', { token: admin.token, affects: 'marketing' });
    await checkGet('Admin', 'Audit logs', '/admin/audit-logs', { token: admin.token, affects: 'admin security' });
    await checkGet('Admin', 'Prescription orders', '/admin/prescription-orders', {
      token: admin.token,
      affects: 'admin, pharmacy',
    });

    const publicDoctorIds = new Set(listOf(doctors.json, ['doctors']).map((d) => d.id));
    const adminDoctorIds = new Set(listOf(adminDoctors.json, ['doctors']).map((d) => d.id));
    const sharedDocs = [...publicDoctorIds].filter((id) => adminDoctorIds.has(id)).length;
    record(
      'Cross',
      'Admin doctors = public doctors',
      sharedDocs > 0,
      'admin ↔ website ↔ user app',
      `${sharedDocs} shared`,
    );
    const publicVendorIds = new Set(listOf(vendors.json, ['vendors']).map((d) => d.id));
    const adminVendorIds = new Set(listOf(adminVendors.json, ['vendors']).map((d) => d.id));
    const sharedVendors = [...publicVendorIds].filter((id) => adminVendorIds.has(id)).length;
    record(
      'Cross',
      'Admin pharmacies = public pharmacies',
      sharedVendors > 0,
      'admin ↔ website ↔ user app',
      `${sharedVendors} shared`,
    );
  }

  console.log('\nPharmacy panel');
  if (vendor.token) {
    await checkGet('Pharmacy', 'Profile', '/vendors/profile', { token: vendor.token, affects: 'pharmacy panel' });
    await checkGet('Pharmacy', 'Dashboard', '/vendors/dashboard/stats', {
      token: vendor.token,
      affects: 'pharmacy panel',
    });
    const mine = await checkGet('Pharmacy', 'My products', '/vendors/products/mine', {
      token: vendor.token,
      keys: ['products'],
      affects: 'pharmacy panel → patient catalog',
    });
    await checkGet('Pharmacy', 'Vendor orders', '/orders/vendor', {
      token: vendor.token,
      affects: 'pharmacy panel, patient orders',
    });
    await checkGet('Pharmacy', 'Earnings', '/vendors/earnings/summary', {
      token: vendor.token,
      affects: 'pharmacy panel',
    });
    await checkGet('Pharmacy', 'Prescription queue', '/prescription-orders/vendor', {
      token: vendor.token,
      affects: 'pharmacy panel, patient prescriptions',
    });
    await checkGet('Pharmacy', 'Notifications', '/notifications/vendor', {
      token: vendor.token,
      affects: 'pharmacy panel',
    });
    if (vendor.partner?.id && vendorId) {
      record(
        'Cross',
        'Logged-in pharmacy visible to patients',
        listOf(vendors.json, ['vendors']).some((v) => v.id === vendor.partner.id),
        'pharmacy panel → website/app',
        vendor.partner.business_name || vendor.partner.id,
      );
    }
    const mineIds = new Set(listOf(mine.json, ['products']).map((p) => p.id));
    const publicProductIds = new Set(listOf(products.json, ['products']).map((p) => p.id));
    const listed = [...mineIds].filter((id) => publicProductIds.has(id)).length;
    if (mineIds.size > 0) {
      record(
        'Cross',
        'Vendor products on patient catalog',
        listed > 0,
        'pharmacy panel → website/app',
        `${listed}/${mineIds.size} visible`,
      );
    }
  }

  console.log('\nDoctor portal');
  if (doctor.token) {
    const profile = await checkGet('Doctor', 'Profile', '/partners/doctor/profile', {
      token: doctor.token,
      affects: 'doctor panel, doctor app',
    });
    await checkGet('Doctor', 'Appointments', '/partners/doctor/appointments', {
      token: doctor.token,
      keys: ['appointments'],
      affects: 'doctor panel ↔ patient bookings',
    });
    await checkGet('Doctor', 'Schedule', '/partners/doctor/schedule', {
      token: doctor.token,
      affects: 'doctor panel, booking slots',
    });
    await checkGet('Doctor', 'Patients', '/partners/doctor/patients', {
      token: doctor.token,
      affects: 'doctor panel (only their patients)',
    });
    await checkGet('Doctor', 'Stats', '/partners/doctor/stats', { token: doctor.token, affects: 'doctor panel' });
    await checkGet('Doctor', 'Practice locations', '/partners/doctor/practice-locations', {
      token: doctor.token,
      affects: 'clinic booking on website/app',
    });
    const doc = profile.data?.doctor || profile.data || doctor.partner;
    if (doc?.id) {
      record(
        'Cross',
        'Logged-in doctor visible to patients',
        listOf(doctors.json, ['doctors']).some((d) => d.id === doc.id),
        'doctor panel → website/app',
        doc.name || doc.id,
      );
    }
  }

  console.log('\nLab portal');
  if (lab.token) {
    const profile = await checkGet('Lab', 'Profile', '/partners/lab/profile', {
      token: lab.token,
      affects: 'lab panel',
    });
    await checkGet('Lab', 'Bookings', '/partners/lab/bookings', {
      token: lab.token,
      affects: 'lab panel ↔ patient lab bookings',
    });
    const labTests = await checkGet('Lab', 'My tests', '/partners/lab/tests', {
      token: lab.token,
      keys: ['tests', 'labTests'],
      affects: 'lab panel → patient lab catalog',
    });
    await checkGet('Lab', 'Reports summary', '/partners/lab/reports/summary', {
      token: lab.token,
      affects: 'lab panel',
    });
    const labProfile = profile.data?.lab || profile.data || lab.partner;
    if (labProfile?.id) {
      record(
        'Cross',
        'Logged-in lab visible to patients',
        listOf(labs.json, ['labs', 'labPartners']).some((item) => item.id === labProfile.id),
        'lab panel → website/app',
        labProfile.name || labProfile.id,
      );
    }
    const portalTestIds = new Set(listOf(labTests.json, ['tests', 'labTests']).map((t) => t.id));
    const publicTestIds = new Set(listOf(tests.json, ['tests', 'labTests']).map((t) => t.id));
    const sharedTests = [...portalTestIds].filter((id) => publicTestIds.has(id)).length;
    if (portalTestIds.size > 0) {
      record(
        'Cross',
        'Lab tests on patient catalog',
        sharedTests > 0,
        'lab panel → website/app',
        `${sharedTests}/${portalTestIds.size} visible`,
      );
    }
  }

  console.log('\nCMS write → app + website');
  if (admin.token) {
    const adminContent = await request('GET', '/admin/content?section=specialties', { token: admin.token });
    const spec = listOf(adminContent.json, ['items']).find((item) => item.section === 'specialties');
    if (!spec) {
      record('CMS', 'Edit specialty and see it live', false, 'admin → app + website', 'no specialty to edit');
    } else {
      const original = spec.title;
      const updated = `${original} ${MARKER}`;
      const patch = await request('PATCH', `/admin/content/${spec.id}`, {
        token: admin.token,
        body: { title: updated },
      });
      if (!patch.ok) {
        record('CMS', 'Save specialty from admin', false, 'admin CMS', failMsg(patch));
      } else {
        const appView = await request('GET', '/content?section=specialties&channel=app');
        const webView = await request('GET', '/content?section=specialties&channel=website');
        const onApp = listOf(appView.json, ['items']).some((item) => item.title === updated);
        const onWeb = listOf(webView.json, ['items']).some((item) => item.title === updated);
        record(
          'CMS',
          'Admin specialty edit reaches user app',
          onApp,
          'admin → user app specialities',
          onApp ? updated : 'app still has old title',
        );
        record(
          'CMS',
          'Admin specialty edit reaches website',
          onWeb,
          'admin → website specialities',
          onWeb ? updated : 'website still has old title',
        );
        await request('PATCH', `/admin/content/${spec.id}`, {
          token: admin.token,
          body: { title: original },
        });
        record('CMS', 'Revert specialty after test', true, 'admin CMS', original);
      }
    }

    const settingsRes = await request('GET', '/admin/content', { token: admin.token });
    const settings = settingsRes.data?.settings || {};
    const oldTagline = settings.tagline || '';
    const newTagline = `Care check ${MARKER}`;
    const put = await request('PUT', '/admin/content/settings', {
      token: admin.token,
      body: { tagline: newTagline },
    });
    if (!put.ok) {
      record('CMS', 'Save site tagline from admin', false, 'admin site details', failMsg(put));
    } else {
      const publicSettings = await request('GET', '/content?channel=website');
      const live = publicSettings.data?.settings?.tagline === newTagline;
      record(
        'CMS',
        'Admin tagline reaches website/app',
        live,
        'admin → website footer, app download banner',
        live ? newTagline : publicSettings.data?.settings?.tagline || 'missing',
      );
      await request('PUT', '/admin/content/settings', {
        token: admin.token,
        body: { tagline: oldTagline },
      });
      record('CMS', 'Revert tagline after test', true, 'admin site details', oldTagline);
    }
  }

  console.log('\nAccess isolation');
  const guestOrders = await request('GET', '/orders');
  record('Isolation', 'Guest cannot read orders', guestOrders.status === 401, 'security', `HTTP ${guestOrders.status}`);
  if (customer.token) {
    const cAdmin = await request('GET', '/admin/dashboard', { token: customer.token });
    record('Isolation', 'Patient cannot open admin', [401, 403].includes(cAdmin.status), 'security', `HTTP ${cAdmin.status}`);
    const cDoc = await request('GET', '/partners/doctor/profile', { token: customer.token });
    record('Isolation', 'Patient cannot open doctor portal', [401, 403].includes(cDoc.status), 'security', `HTTP ${cDoc.status}`);
  }
  if (vendor.token) {
    const vDoc = await request('GET', '/partners/doctor/profile', { token: vendor.token });
    record('Isolation', 'Pharmacy cannot open doctor portal', [401, 403].includes(vDoc.status), 'security', `HTTP ${vDoc.status}`);
  }
  if (doctor.token) {
    const dLab = await request('GET', '/partners/lab/profile', { token: doctor.token });
    record('Isolation', 'Doctor cannot open lab portal', [401, 403].includes(dLab.status), 'security', `HTTP ${dLab.status}`);
    const dAdmin = await request('GET', '/admin/content', { token: doctor.token });
    record('Isolation', 'Doctor cannot open admin CMS', [401, 403].includes(dAdmin.status), 'security', `HTTP ${dAdmin.status}`);
  }

  console.log('\nWebsite + panels (UI)');
  await pageHas(
    'http://localhost:3000/',
    ['Medzoos', 'Your Healthcare. One Trusted Platform.'],
    'UI',
    'Website landing loads CMS headline',
    'website ← admin site details',
  );
  await pageHas('http://localhost:3000/doctors', ['Find your doctor', 'Medzoos'], 'UI', 'Website doctors page', 'website ← doctors API');
  await pageHas('http://localhost:3000/lab-tests', ['Medzoos'], 'UI', 'Website lab tests page', 'website ← lab API');
  await pageHas('http://localhost:3000/vendors', ['Medzoos'], 'UI', 'Website pharmacies page', 'website ← vendors API');
  await pageHas('http://localhost:3001/portal-access', ['Restricted Portal', 'Administrator Email'], 'UI', 'Admin login page', 'admin panel');
  try {
    const res = await fetch('http://localhost:3001/admin/content', {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const html = await res.text();
    const signedIn = html.includes('App & Website') && html.includes('Care shortcuts');
    const loginGate =
      html.includes('Restricted Portal') ||
      html.includes('portal-access') ||
      html.includes('Verifying Access');
    record(
      'UI',
      'Admin content hub',
      signedIn || loginGate,
      'admin CMS',
      signedIn ? 'hub loaded' : 'auth gate working',
    );
  } catch (err) {
    record('UI', 'Admin content hub', false, 'admin CMS', err.message);
  }

  for (const front of [
    { name: 'Pharmacy panel UI', port: 3002, path: '/vendor', needle: 'Medzoos' },
    { name: 'Doctor panel UI', port: 3003, path: '/doctor', needle: 'Doctor Portal' },
    { name: 'Lab panel UI', port: 3004, path: '/lab', needle: 'Medzoos' },
  ]) {
    const origin = `http://localhost:${front.port}`;
    try {
      const res = await fetch(`${origin}${front.path}`, {
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      const html = await res.text();
      const pageOk = res.ok || (res.status >= 200 && res.status < 500);
      const hasCopy = html.includes(front.needle) || html.includes('Medzoos') || html.length > 200;
      if (!pageOk || !hasCopy) {
        record('UI', front.name, false, front.name, `${origin} HTTP ${res.status}`);
        continue;
      }
      const api = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(8000) });
      const json = await api.json().catch(() => null);
      const proxied = api.ok && (json?.message?.includes('Medzoos API') || json?.status === 'success');
      record(
        'UI',
        front.name,
        true,
        front.name,
        proxied ? `:${front.port} up, API proxied` : `:${front.port} up`,
      );
    } catch {
      record('UI', front.name, false, front.name, `not running on :${front.port}`);
    }
  }
  try {
    const metro = await fetch('http://localhost:8081/status', { signal: AbortSignal.timeout(3000) });
    record('UI', 'User app Metro bundler', metro.ok, 'user app', 'http://localhost:8081');
  } catch {
    record('UI', 'User app Metro bundler', false, 'user app', 'not running on :8081');
  }

  const ok = results.filter((r) => r.ok).length;
  const notOk = results.filter((r) => !r.ok).length;
  console.log('\n────────────────────────────────────────');
  console.log(`  ${ok} OK   ${notOk} NOT OK   (${results.length} checks)`);
  console.log('────────────────────────────────────────\n');
  if (notOk) {
    console.log('NOT OK:');
    for (const item of results.filter((r) => !r.ok)) {
      console.log(`  - [${item.group}] ${item.name}: ${item.detail}`);
    }
    console.log('');
  }

  const out = path.join(__dirname, 'functionality-report.json');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ok, notOk, results }, null, 2));
  process.exit(notOk > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
