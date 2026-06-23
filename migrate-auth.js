const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to Unified Auth Model...');

  // 1. Migrate Users (Customers & Admins)
  const users = await prisma.user.findMany({ where: { account_id: null } });
  for (const user of users) {
    if (!user.email || !user.password) continue;
    const account = await prisma.account.create({
      data: {
        email: user.email,
        password: user.password,
        role: user.role,
      }
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { account_id: account.id }
    });
    console.log(`Migrated User: ${user.email}`);
  }

  // 2. Migrate Vendors
  const vendors = await prisma.vendor.findMany({ where: { account_id: null } });
  for (const vendor of vendors) {
    if (!vendor.email || !vendor.password) continue;
    const account = await prisma.account.create({
      data: {
        email: vendor.email,
        password: vendor.password,
        role: 'vendor',
      }
    });
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { account_id: account.id }
    });
    console.log(`Migrated Vendor: ${vendor.email}`);
  }

  // 3. Migrate Doctors
  const doctors = await prisma.doctor.findMany({ where: { account_id: null } });
  for (const doctor of doctors) {
    if (!doctor.email || !doctor.password) continue;
    const account = await prisma.account.create({
      data: {
        email: doctor.email,
        password: doctor.password,
        role: 'doctor',
      }
    });
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: { account_id: account.id }
    });
    console.log(`Migrated Doctor: ${doctor.email}`);
  }

  // 4. Migrate Lab Partners
  const labs = await prisma.labPartner.findMany({ where: { account_id: null } });
  for (const lab of labs) {
    if (!lab.email || !lab.password) continue;
    const account = await prisma.account.create({
      data: {
        email: lab.email,
        password: lab.password,
        role: 'lab',
      }
    });
    await prisma.labPartner.update({
      where: { id: lab.id },
      data: { account_id: account.id }
    });
    console.log(`Migrated Lab: ${lab.email}`);
  }

  console.log('Migration complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
