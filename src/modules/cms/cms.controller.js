const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const cmsService = require('./cms.service');

const listPublic = catchAsync(async (req, res) => {
  const items = await cmsService.listPublic(req.query.section, req.query.channel);
  const settings = await cmsService.getSettings();
  sendResponse(res, 200, { items, settings }, 'Content loaded');
});

const listAdmin = catchAsync(async (req, res) => {
  const [items, settings] = await Promise.all([
    cmsService.listAdmin(req.query.section),
    cmsService.getSettings(),
  ]);
  sendResponse(res, 200, { items, settings }, 'Content loaded');
});

const createItem = catchAsync(async (req, res) => {
  const item = await cmsService.createItem(req.body);
  sendResponse(res, 201, { item }, 'Content added');
});

const updateItem = catchAsync(async (req, res) => {
  const item = await cmsService.updateItem(req.params.id, req.body);
  sendResponse(res, 200, { item }, 'Content updated');
});

const deleteItem = catchAsync(async (req, res) => {
  await cmsService.deleteItem(req.params.id);
  sendResponse(res, 200, null, 'Content removed');
});

const updateSettings = catchAsync(async (req, res) => {
  const settings = await cmsService.updateSettings(req.body);
  sendResponse(res, 200, { settings }, 'Site details saved');
});

module.exports = {
  listPublic,
  listAdmin,
  createItem,
  updateItem,
  deleteItem,
  updateSettings,
};
