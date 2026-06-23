const catchAsync = require('../../utils/catchAsync');
const prisma = require('../../config/database');
const { sendResponse } = require('../../utils/response');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../../utils/AppError');

const getAddresses = catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  sendResponse(res, 200, { addresses: user.addresses || [] }, 'Addresses fetched');
});

const addAddress = catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  let addresses = user.addresses || [];

  const { name, street, city, country, postal_code, is_default } = req.body;

  // If new address is default, reset others
  if (is_default) {
    addresses = addresses.map(addr => ({ ...addr, is_default: false }));
  }

  const newAddress = {
    id: uuidv4(),
    name,
    street,
    city,
    country,
    postal_code,
    is_default: is_default || false
  };

  addresses.push(newAddress);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { addresses }
  });

  sendResponse(res, 201, { address: newAddress }, 'Address added');
});

const editAddress = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  let addresses = user.addresses || [];

  const addressIndex = addresses.findIndex(addr => addr.id === id);
  if (addressIndex === -1) {
    throw new AppError('Address not found', 404);
  }

  const { name, street, city, country, postal_code, is_default } = req.body;

  // If is_default is true, reset others
  if (is_default) {
    addresses = addresses.map(addr => ({ ...addr, is_default: false }));
  }

  const updatedAddress = {
    ...addresses[addressIndex],
    name: name !== undefined ? name : addresses[addressIndex].name,
    street: street !== undefined ? street : addresses[addressIndex].street,
    city: city !== undefined ? city : addresses[addressIndex].city,
    country: country !== undefined ? country : addresses[addressIndex].country,
    postal_code: postal_code !== undefined ? postal_code : addresses[addressIndex].postal_code,
    is_default: is_default !== undefined ? is_default : addresses[addressIndex].is_default
  };

  addresses[addressIndex] = updatedAddress;

  await prisma.user.update({
    where: { id: req.user.id },
    data: { addresses }
  });

  sendResponse(res, 200, { address: updatedAddress }, 'Address updated successfully');
});

const deleteAddress = catchAsync(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  let addresses = user.addresses || [];

  const addressExists = addresses.some(addr => addr.id === req.params.id);
  if (!addressExists) {
    throw new AppError('Address not found', 404);
  }

  addresses = addresses.filter(addr => addr.id !== req.params.id);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { addresses }
  });

  sendResponse(res, 200, null, 'Address deleted');
});

module.exports = {
  getAddresses,
  addAddress,
  editAddress,
  deleteAddress
};
