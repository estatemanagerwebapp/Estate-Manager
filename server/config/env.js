const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root or server local .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // fallback to local

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/estate_manager',
  jwtSecret: process.env.JWT_SECRET || 'estate-manager-dev-jwt-secret-key-min-32-chars-long',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'estate-manager-dev-refresh-token-secret-key',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  cookieSecret: process.env.COOKIE_SECRET || 'estate-manager-cookie-secret',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  onboardingWebhookSecret: process.env.ONBOARDING_WEBHOOK_SECRET || 'dev-onboarding-secret-key'
};
