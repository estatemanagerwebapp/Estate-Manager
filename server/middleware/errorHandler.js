/**
 * Centralized Error Handling Middleware
 */
module.exports = function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  // Handle Zod Validation Errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data provided.',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_KEY',
      message: `A record with this ${field} already exists.`
    });
  }

  // Handle JWT Error
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Invalid or expired authorization token.'
    });
  }

  // Log server errors
  if (statusCode >= 500) {
    console.error(`[SERVER_ERROR] ${req.method} ${req.originalUrl}:`, err.stack || err);
  }

  res.status(statusCode).json({
    success: false,
    error: err.errorCode || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected internal server error occurred.'
  });
};
