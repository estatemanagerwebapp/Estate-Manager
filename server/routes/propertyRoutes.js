const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

// Public/preview read routes
router.get('/', propertyController.getProperties);
router.get('/meta/tenants', propertyController.getTenantsList);
router.get('/:id', propertyController.getPropertyById);

// Protected mutation routes
router.use(authenticate);
router.post('/', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), propertyController.createProperty);
router.patch('/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), propertyController.updateProperty);
router.delete('/:id', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), propertyController.deleteProperty);

module.exports = router;
