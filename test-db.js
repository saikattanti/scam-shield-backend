require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Testing connection to:', process.env.DATABASE_URL.split('@')[1]);
    const users = await prisma.user.count();
    console.log('Successfully connected! User count:', users);
  } catch (e) {
    console.error('Connection failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
