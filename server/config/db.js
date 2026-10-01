const prisma = require('../lib/prisma');

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('Database connected: Supabase PostgreSQL via Prisma');
    const { seedIfEmpty } = require('./seeder');
    await seedIfEmpty();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
};

const isConnected = () => true;

module.exports = { connectDB, isConnected };
