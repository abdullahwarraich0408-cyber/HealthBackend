const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');

const verifyPrescription = async (prescriptionId, adminId, status, notes) => {
  const prescription = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  
  if (!prescription) throw new AppError('Prescription not found', 404);

  return prisma.prescription.update({
    where: { id: prescriptionId },
    data: { status, verified_by: adminId, notes }
  });
};

const fetchPendingPrescriptions = async () => {
  return prisma.prescription.findMany({ where: { status: 'pending' } });
};

module.exports = {
  verifyPrescription,
  fetchPendingPrescriptions
};
