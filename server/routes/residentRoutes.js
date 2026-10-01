const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

// Public/preview read routes
router.get('/', residentController.getResidents);
router.get('/:id', residentController.getResidentById);

// Protected mutation routes
router.use(authenticate);
router.post('/', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), residentController.createResident);
router.patch('/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), residentController.updateResident);

module.exports = router;
