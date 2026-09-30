const mongoose = require('mongoose');
const config = require('./env');
const { seedDatabase } = require('./seeder');

let isConnected = false;
let mongoServer = null;

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 2000,
    family: 4
  };

  try {
    // 1. Try external connection (e.g. localhost:27017 or Atlas)
    const conn = await mongoose.connect(config.mongoUri, options);
    isConnected = !!conn.connections[0].readyState;
    console.log(`✅ External MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    await seedDatabase();
  } catch (error) {
    console.warn(`⚠️  External MongoDB not available (${error.message}).`);
    console.log(`🚀 Initializing high-performance embedded database engine...`);
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'estate_manager'
        }
      });
      const memoryUri = mongoServer.getUri();
      const conn = await mongoose.connect(memoryUri);
      isConnected = !!conn.connections[0].readyState;
      console.log(`✅ Embedded Database active & connected: ${memoryUri}`);
      await seedDatabase();
    } catch (embeddedErr) {
      console.error(`❌ Failed to start embedded database: ${embeddedErr.message}`);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
});

module.exports = {
  connectDB,
  isConnected: () => isConnected,
  stopEmbeddedDB: async () => {
    if (mongoServer) await mongoServer.stop();
  }
};
