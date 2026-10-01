const express = require('express');
const router = express.Router();
const estateController = require('../controllers/estateController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

// Public/Preview Read Routes
router.get('/', estateController.getEstates);
router.get('/:id', estateController.getEstateById);
router.get('/:id/properties', estateController.getEstateProperties);

// Protected Mutation & User-scoped Routes
router.use(authenticate);
router.get('/my-properties', estateController.getMyProperties);
router.post('/', requireRoles(ROLES.SUPER_ADMIN), estateController.createEstate);
router.patch('/:id/status', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), estateController.updateEstateStatus);
router.post('/properties', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), estateController.createProperty);

module.exports = router;
