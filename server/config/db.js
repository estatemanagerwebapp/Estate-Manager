const mongoose = require('mongoose');
const config = require('./env');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4 // IPv4
  };

  try {
    const conn = await mongoose.connect(config.mongoUri, options);
    isConnected = !!conn.connections[0].readyState;
    console.log(`✅ MongoDB Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.warn(`⚠️  MongoDB Connection Warning: ${error.message}`);
    console.warn(`👉 Running in offline/detached mode until database is reachable at ${config.mongoUri}`);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
  isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully.');
  isConnected = true;
});

module.exports = {
  connectDB,
  isConnected: () => isConnected
};
