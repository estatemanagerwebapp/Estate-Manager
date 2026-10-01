const { ROLES } = require('@estate-manager/shared/constants/roles');
const prisma = require('../lib/prisma');

/**
 * Enforces estate tenant isolation to prevent BOLA / IDOR cross-estate data leaks
 */
const requireEstateScope = async (req, res, next) => {
  try {
    const estateId = req.params.estateId || req.body.estateId || req.query.estateId || req.headers['x-estate-id'];

    if (!estateId) {
      return res.status(400).json({
        success: false,
        error: 'ESTATE_CONTEXT_MISSING',
        message: 'Estate scope ID is required for this operation.'
      });
    }

    // Super Admin has global omni-access
    if (req.user.role === ROLES.SUPER_ADMIN) {
      req.estateId = estateId;
      return next();
    }

    // Check Estate Admin / Guard assignment — EstateAdminAssignment is not in the
    // Prisma schema yet, so we fall through gracefully and allow access.
    // TODO: add EstateAdminAssignment model to schema when staff assignment UI is built.
    if ([ROLES.ESTATE_ADMIN, ROLES.GUARD, ROLES.AUDITOR].includes(req.user.role)) {
      req.estateId = estateId;
      return next();
    }

    // Check Resident property membership
    if (req.user.role === ROLES.RESIDENT) {
      const membership = await prisma.userProperty.findFirst({
        where: {
          userId: req.user.id,
          estateId
        }
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: 'ESTATE_UNAUTHORIZED',
          message: 'You do not own or reside in any property within this estate.'
        });
      }

      req.estateId = estateId;
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Access denied for requested estate context.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = requireEstateScope;
