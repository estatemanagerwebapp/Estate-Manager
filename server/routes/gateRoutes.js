const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

// Verification endpoint for guard kiosk tablet
router.post('/verify', requireRoles(ROLES.GUARD, ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), gateController.verifyCode);

// Live gate verification audit logs & KPIs
router.get('/logs', requireRoles(ROLES.GUARD, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.AUDITOR), gateController.getGateLogs);

// Active passes registry & creation
router.get('/passes', requireRoles(ROLES.GUARD, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.AUDITOR), gateController.getGatePasses);
router.post('/passes', requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.GUARD, ROLES.RESIDENT), gateController.createPass);
router.patch('/passes/:id/revoke', requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.GUARD, ROLES.RESIDENT), gateController.revokePass);

// Visitor Departure Check-Out
router.post('/checkout', requireRoles(ROLES.GUARD, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN), gateController.checkoutVisitor);

// Security Watchlist
router.get('/watchlist', requireRoles(ROLES.GUARD, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.AUDITOR), gateController.getWatchlist);
router.post('/watchlist', requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.GUARD), gateController.addToWatchlist);

module.exports = router;
