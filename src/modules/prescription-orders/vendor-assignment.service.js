const prisma = require('../../config/database');
const { haversineKm, resolveCoords, etaMinutes, hasKnownLocation } = require('../../utils/geo');

const ACCEPT_TIMEOUT_SEC = 30;

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stockMatchScore(products, items) {
  if (!items?.length) return 50;
  if (!products?.length) return 0;

  let matched = 0;
  for (const item of items) {
    const itemName = normalizeName(item.name);
    const hit = products.find((product) => {
      const productName = normalizeName(product.name);
      const formula = normalizeName(product.formula);
      return (
        productName.includes(itemName) ||
        itemName.includes(productName) ||
        (formula && (formula.includes(itemName) || itemName.includes(formula)))
      );
    });
    if (hit && hit.stock >= (item.quantity || 1)) matched += 1;
  }
  return (matched / items.length) * 100;
}

function distanceScore(distanceKm, serviceRadiusKm) {
  if (distanceKm == null) return 50;
  const radius = serviceRadiusKm || 10;
  if (distanceKm > radius) return 0;
  return Math.max(0, 100 - (distanceKm / radius) * 100);
}

function loadScore(activeOrders) {
  return Math.max(0, 100 - activeOrders * 15);
}

function ratingScore(averageRating) {
  return ((averageRating || 4.5) / 5) * 100;
}

function computeVendorScore(vendor, orderItems, customerCoords) {
  const vendorCoords = resolveCoords(vendor);
  const distanceKm = haversineKm(customerCoords, vendorCoords);
  const stock = stockMatchScore(vendor.products, orderItems);
  const distance = distanceScore(distanceKm, vendor.service_radius_km);
  const load = loadScore(vendor._activeOrders || 0);
  const rating = ratingScore(vendor.average_rating);

  const score = stock * 0.4 + distance * 0.3 + load * 0.2 + rating * 0.1;
  return { score, distanceKm, stock, distance, load, rating };
}

async function getEligibleVendors(order, rejectedIds = []) {
  const customerCoords = resolveCoords(order.delivery_address);
  if (!customerCoords) return [];

  const vendors = await prisma.vendor.findMany({
    where: {
      status: 'approved',
      is_open: true,
      is_online: true,
      id: { notIn: rejectedIds },
    },
    include: {
      products: { select: { id: true, name: true, formula: true, stock: true, price: true } },
      current_prescription_orders: {
        where: {
          status: {
            in: ['awaiting_accept', 'accepted', 'stock_pending', 'packed', 'rider_assigned', 'out_for_delivery'],
          },
        },
        select: { id: true },
      },
    },
  });

  return vendors
    .filter((vendor) => hasKnownLocation(vendor))
    .map((vendor) => {
      const vendorCoords = resolveCoords(vendor);
      if (!vendorCoords) return null;
      const distanceKm = haversineKm(customerCoords, vendorCoords);
      if (distanceKm != null && distanceKm > (vendor.service_radius_km || 10)) return null;

      const enriched = { ...vendor, _activeOrders: vendor.current_prescription_orders.length };
      const result = computeVendorScore(enriched, order.items, customerCoords);
      return {
        vendor,
        ...result,
        eta_minutes: etaMinutes(result.distanceKm, order.delivery_type),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

async function pickNextVendor(order, rejectedIds = []) {
  const ranked = await getEligibleVendors(order, rejectedIds);
  return ranked[0] || null;
}

module.exports = {
  ACCEPT_TIMEOUT_SEC,
  computeVendorScore,
  getEligibleVendors,
  pickNextVendor,
  stockMatchScore,
};
