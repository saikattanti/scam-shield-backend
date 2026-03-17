// Prisma client configuration for Neon PostgreSQL (Prisma v5)
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

let prisma;

// Lazy initialize Prisma to ensure environment is loaded
function getPrismaClient() {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('DATABASE_URL is not defined');
      throw new Error('DATABASE_URL is not defined in environment variables');
    }

    console.log('Initializing Prisma v5 with DATABASE_URL:', connectionString.substring(0, 50) + '...');
    
    try {
      // Create the pool with the connection string
      const pool = new Pool({ connectionString });
      
      // Create the adapter with the pool and WebSocket
      const adapter = new PrismaNeon(pool, { webSocketConstructor: ws });

      prisma = new PrismaClient({
        adapter,
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



