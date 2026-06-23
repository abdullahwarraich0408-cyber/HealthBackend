const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    const cells = [];
    let insideQuote = false;
    let currentCell = '';
    
    for (let charIndex = 0; charIndex < currentLine.length; charIndex++) {
      const char = currentLine[charIndex];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim().replace(/^["']|["']$/g, ''));

    if (cells.length === headers.length) {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = cells[index];
      });
      items.push(item);
    }
  }
  return items;
};

const bulkImport = async (vendorId, csvText) => {
  const parsedItems = parseCSV(csvText);
  if (parsedItems.length === 0) {
    throw new AppError('CSV file is empty or formatted incorrectly', 400);
  }

  const importedProducts = [];
  
  // Use a transaction or sequential creations
  for (const item of parsedItems) {
    const name = item.name || item.Name;
    const priceRaw = item.price || item.Price;
    const stockRaw = item.stock || item.Stock || '0';
    const category = item.category || item.Category || null;
    const formula = item.formula || item.Formula || null;
    const description = item.description || item.Description || null;

    if (!name || !priceRaw) continue;

    const price = parseFloat(priceRaw);
    const stock = parseInt(stockRaw, 10);

    if (isNaN(price) || isNaN(stock)) continue;

    const product = await prisma.product.create({
      data: {
        vendor_id: vendorId,
        name,
        formula,
        description,
        price,
        stock,
        category
      }
    });
    importedProducts.push(product);
  }

  return {
    count: importedProducts.length,
    products: importedProducts
  };
};

const updateStock = async (vendorId, productId, stock) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);

  if (product.vendor_id !== vendorId) {
    throw new AppError('You do not own this product', 403);
  }

  return prisma.product.update({
    where: { id: productId },
    data: { stock }
  });
};

const getLowStock = async (vendorId, threshold = 10) => {
  return prisma.product.findMany({
    where: {
      vendor_id: vendorId,
      stock: { lte: threshold }
    },
    orderBy: { stock: 'asc' }
  });
};

const syncInventory = async (vendorId) => {
  // Simulate stock sync operation (e.g., verifying stock level consistency in DB)
  const products = await prisma.product.findMany({
    where: { vendor_id: vendorId }
  });

  // Mock processing / audit logging
  await prisma.auditLog.create({
    data: {
      user_id: vendorId,
      action: 'INVENTORY_SYNC',
      entity: 'VendorProduct',
      details: { productsCount: products.length }
    }
  });

  return {
    syncedAt: new Date().toISOString(),
    productsVerifiedCount: products.length
  };
};

module.exports = {
  bulkImport,
  updateStock,
  getLowStock,
  syncInventory
};
