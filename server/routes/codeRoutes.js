const express = require('express');
const router = express.Router();
const codeController = require('../controllers/codeController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.post('/', requireRoles(ROLES.RESIDENT, ROLES.SUPER_ADMIN), codeController.createAccessCode);
router.get('/my', codeController.getMyAccessCodes);
router.patch('/:id/revoke', codeController.revokeAccessCode);

module.exports = router;
