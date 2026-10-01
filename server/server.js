const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiter');
const sanitize = require('./middleware/sanitize');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

// 1. Security Headers via Helmet & Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", config.clientUrl]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// 2. CORS Allowlisting
app.use(cors({
  origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-estate-id', 'x-onboarding-secret']
}));

// 3. Request Logging
if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// 4. Rate Limiting
app.use('/api', apiLimiter);

// 5. Body Parsers & Cookie Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.cookieSecret));

// 6. Request Sanitization
app.use(sanitize);

// 7. Route Mounting
app.use('/api', apiRoutes);
// Support serverless environments where /api prefix might be trimmed
app.use('/', apiRoutes);

// Root Health & Status (fallback if apiRoutes doesn't handle root)
app.get('/status', (req, res) => {
  res.json({
    name: 'Estate Manager API',
    version: '1.0.0',
    status: 'ONLINE',
    docs: '/api/health'
  });
});

// Centralized Error Handler (Must be after routes)
app.use(errorHandler);

const server = http.createServer(app);

// Start Server and Connect DB
const startServer = async () => {
  await connectDB();

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🛡️  Estate Manager Backend API is active!`);
    console.log(`📡 URL:         http://localhost:${config.port}`);
    console.log(`🌍 Environment: ${config.env}`);
    console.log(`🔒 Security:    7-Layer Defense Pipeline Armed`);
    console.log(`======================================================\n`);
  });
};

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer();
}

module.exports = { app, server };
