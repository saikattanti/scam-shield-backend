// Prisma client configuration for Neon PostgreSQL (Prisma v5)
const { PrismaClient } = require('@prisma/client');

let prisma;

// Lazy initialize Prisma to ensure environment is loaded
function getPrismaClient() {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('DATABASE_URL is not defined');
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    console.log('Initializing standard Prisma Client with DATABASE_URL...');
    
    try {
      // Use standard Prisma over HTTP/TCP instead of the Edge Websocket adapter 
      // preventing ErrorEvent timeouts locally.
      prisma = new PrismaClient({
        log: ['error', 'warn'],
      });
      
      console.log('✅ Prisma v5 client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Prisma:', error);
      throw error;
    }
  }
  return prisma;
}

module.exports = {
  get prisma() {
    return getPrismaClient();
  },
  getPrismaClient
};



