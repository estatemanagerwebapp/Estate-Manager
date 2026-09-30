const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

// Verification endpoint optimized for speed
router.post('/verify', requireRoles(ROLES.GUARD, ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), gateController.verifyCode);
router.get('/logs', requireRoles(ROLES.GUARD, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN, ROLES.AUDITOR), gateController.getGateLogs);

module.exports = router;
