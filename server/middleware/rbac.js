const { ROLES } = require('@estate-manager/shared/constants/roles');
const { hasPermission } = require('@estate-manager/shared/permissions');

/**
 * Restrict route access to specific roles
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'You must be logged in to access this resource.'
      });
    }

    if (req.user.role === ROLES.SUPER_ADMIN || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.'
    });
  };
};

/**
 * Restrict route access by specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required.'
      });
    }

    if (req.user.role === ROLES.SUPER_ADMIN || hasPermission(req.user.role, permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'PERMISSION_DENIED',
      message: `Required permission '${permission}' missing.`
    });
  };
};

module.exports = {
  requireRoles,
  requirePermission
};
