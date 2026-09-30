const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'No authorization token found. Please sign in.'
      });
    }

    const decoded = jwt.verify(token, config.jwtSecret);

    // Attempt to fetch fresh user status if database is connected
    try {
      const user = await User.findById(decoded.id).select('+password');
      if (user && !user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been deactivated.'
        });
      }
      req.user = user ? user.toObject() : decoded;
    } catch {
      // In detached/mock mode, rely on decoded JWT payload
      req.user = decoded;
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Authorization token is invalid or has expired.'
    });
  }
};

module.exports = authenticate;
