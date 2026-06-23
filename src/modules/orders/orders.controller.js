const catchAsync = require('../../utils/catchAsync');
const ordersService = require('./orders.service');
const { sendResponse } = require('../../utils/response');
const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const createOrder = catchAsync(async (req, res) => {
  const { items, delivery_address } = req.body;
  const orders = await ordersService.createOrdersFromCart(req.user.id, items, delivery_address);
  sendResponse(res, 201, { orders }, 'Orders created successfully');
});

const getMyOrders = catchAsync(async (req, res) => {
  let orders;
  if (req.user.role === 'customer') {
    orders = await ordersService.getCustomerOrders(req.user.id);
  } else if (req.user.role === 'vendor') {
    // Actually, vendors shouldn't fetch via this route if they use the same endpoint, 
    // but the role middleware handles this segregation usually via different base routes.
    orders = await ordersService.getVendorOrders(req.user.id);
  } else {
    // admin
    orders = []; 
  }
  
  sendResponse(res, 200, { orders }, 'Orders fetched successfully');
});

const getVendorOrders = catchAsync(async (req, res) => {
  const orders = await ordersService.getVendorOrders(req.user.id);
  sendResponse(res, 200, { orders }, 'Vendor orders fetched successfully');
});

const getOrderDetails = catchAsync(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: {
        include: { product: { select: { name: true, image_url: true } } }
      },
      customer: { select: { name: true, email: true, phone: true } },
      vendor: { select: { business_name: true, email: true } }
    }
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Ensure user is authorized to view
  if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
    throw new AppError('Unauthorized access to order', 403);
  }
  if (req.user.role === 'vendor' && order.vendor_id !== req.user.id) {
    throw new AppError('Unauthorized access to order', 403);
  }

  sendResponse(res, 200, { order }, 'Order details fetched');
});

const updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const order = await ordersService.updateOrderStatus(req.params.id, req.user.id, status);
  sendResponse(res, 200, { order }, 'Order status updated successfully');
});

module.exports = {
  createOrder,
  getMyOrders,
  getVendorOrders,
  getOrderDetails,
  updateOrderStatus
};
