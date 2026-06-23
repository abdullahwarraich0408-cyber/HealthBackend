const redisClient = require('../../config/redis');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const getCart = async (userId) => {
  const cartData = await redisClient.get(`cart:${userId}`);
  if (!cartData) return { items: [], total: 0 };
  
  const cart = JSON.parse(cartData);
  
  if (cart.items.length === 0) return cart;

  const productIds = cart.items.map(i => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      offers: {
        where: { is_active: true, start_date: { lte: new Date() }, expiry_date: { gte: new Date() } }
      }
    }
  });

  const productMap = {};
  products.forEach(p => {
    let finalPrice = p.price;
    if (p.offers && p.offers.length > 0) {
      finalPrice = finalPrice - (finalPrice * (p.offers[0].discount_percentage / 100));
    }
    productMap[p.id] = { ...p, finalPrice };
  });

  let changed = false;
  cart.items = cart.items.filter(item => {
    const p = productMap[item.product_id];
    if (!p) {
      changed = true;
      return false; // remove if product no longer exists
    }
    if (item.price !== p.finalPrice || item.name !== p.name) {
      item.price = p.finalPrice;
      item.name = p.name;
      changed = true;
    }
    if (item.quantity > p.stock) {
      item.quantity = p.stock;
      changed = true;
    }
    return item.quantity > 0;
  });

  if (changed) {
    cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    await redisClient.set(`cart:${userId}`, JSON.stringify(cart), 'EX', 7 * 24 * 60 * 60);
  }

  return cart;
};

const addToCart = async (userId, productId, quantity) => {
  const product = await prisma.product.findUnique({ 
    where: { id: productId },
    include: {
      offers: {
        where: { is_active: true, start_date: { lte: new Date() }, expiry_date: { gte: new Date() } }
      }
    }
  });
  if (!product) throw new AppError('Product not found', 404);
  if (product.stock < quantity) throw new AppError('Not enough stock', 400);

  let finalPrice = product.price;
  if (product.offers && product.offers.length > 0) {
    finalPrice = finalPrice - (finalPrice * (product.offers[0].discount_percentage / 100));
  }

  let cart = await getCart(userId);
  
  const existingItemIndex = cart.items.findIndex(item => item.product_id === productId);
  
  if (existingItemIndex > -1) {
    cart.items[existingItemIndex].quantity += quantity;
    if (cart.items[existingItemIndex].quantity > product.stock) {
      throw new AppError('Requested quantity exceeds available stock', 400);
    }
  } else {
    cart.items.push({
      product_id: productId,
      name: product.name,
      price: finalPrice,
      quantity,
      vendor_id: product.vendor_id
    });
  }

  // Recalculate total
  cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  await redisClient.set(`cart:${userId}`, JSON.stringify(cart), 'EX', 7 * 24 * 60 * 60); // 7 days TTL

  return cart;
};

const removeFromCart = async (userId, productId) => {
  let cart = await getCart(userId);
  
  cart.items = cart.items.filter(item => item.product_id !== productId);
  cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  await redisClient.set(`cart:${userId}`, JSON.stringify(cart), 'EX', 7 * 24 * 60 * 60);

  return cart;
};

const clearCart = async (userId) => {
  await redisClient.del(`cart:${userId}`);
};

const updateCartItemQuantity = async (userId, productId, quantity) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  if (product.stock < quantity) throw new AppError('Not enough stock', 400);

  let cart = await getCart(userId);
  
  const existingItemIndex = cart.items.findIndex(item => item.product_id === productId);
  
  if (existingItemIndex === -1) {
    throw new AppError('Item not found in cart', 404);
  }
  
  cart.items[existingItemIndex].quantity = quantity;

  // Recalculate total
  cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  await redisClient.set(`cart:${userId}`, JSON.stringify(cart), 'EX', 7 * 24 * 60 * 60);

  return cart;
};

const mergeCart = async (userId, items) => {
  let cart = await getCart(userId);

  for (const item of items) {
    const productId = item.product_id || item.productId;
    const quantity = item.quantity;
    
    if (!productId || !quantity || quantity <= 0) continue;

    const product = await prisma.product.findUnique({ 
      where: { id: productId },
      include: {
        offers: {
          where: { is_active: true, start_date: { lte: new Date() }, expiry_date: { gte: new Date() } }
        }
      }
    });
    if (!product) continue;

    let finalPrice = product.price;
    if (product.offers && product.offers.length > 0) {
      finalPrice = finalPrice - (finalPrice * (product.offers[0].discount_percentage / 100));
    }

    const existingItemIndex = cart.items.findIndex(i => i.product_id === productId);

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      cart.items[existingItemIndex].quantity = Math.min(newQuantity, product.stock);
    } else {
      const newQuantity = Math.min(quantity, product.stock);
      if (newQuantity > 0) {
        cart.items.push({
          product_id: productId,
          name: product.name,
          price: finalPrice,
          quantity: newQuantity,
          vendor_id: product.vendor_id
        });
      }
    }
  }

  // Recalculate total
  cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  await redisClient.set(`cart:${userId}`, JSON.stringify(cart), 'EX', 7 * 24 * 60 * 60);

  return cart;
};

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  updateCartItemQuantity,
  mergeCart
};
