const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.get('/', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN, ROLES.AUDITOR), userController.getUsers);

// Super Admin Exclusive Access Code Restriction Engine (Rules 11, 12, 13)
router.post('/:id/restrict-access-code', requireRoles(ROLES.SUPER_ADMIN), userController.restrictAccessCode);
router.post('/:id/unrestrict-access-code', requireRoles(ROLES.SUPER_ADMIN), userController.unrestrictAccessCode);

module.exports = router;
