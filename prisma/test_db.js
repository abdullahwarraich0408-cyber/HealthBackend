require('dotenv').config({ path: '/home/asrar/Desktop/project/ProjectNow/Backend/.env' });
const { PrismaClient } = require('@prisma/client');

async function testConn() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log('Attempting connection to:', process.env.DATABASE_URL);
    await prisma.$connect();
    console.log('Connection successful!');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:');
    console.error(err);
    process.exit(1);
  }
}

testConn();
