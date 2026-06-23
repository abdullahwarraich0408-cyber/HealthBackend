const catchAsync = require('../../utils/catchAsync');
const adminService = require('./admin.service');
const { sendResponse } = require('../../utils/response');
const prisma = require('../../config/database');

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await adminService.getDashboardStats();
  sendResponse(res, 200, { stats }, 'Admin dashboard stats fetched');
});

const getAuditLogs = catchAsync(async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 100
  });
  sendResponse(res, 200, { logs }, 'Audit logs fetched');
});

module.exports = {
  getDashboardStats,
  getAuditLogs
};
