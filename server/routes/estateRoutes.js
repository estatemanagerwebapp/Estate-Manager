const express = require('express');
const router = express.Router();
const estateController = require('../controllers/estateController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.get('/', estateController.getEstates);
router.post('/', requireRoles(ROLES.SUPER_ADMIN), estateController.createEstate);
router.get('/my-properties', estateController.getMyProperties);
router.get('/:id', estateController.getEstateById);
router.get('/:id/properties', estateController.getEstateProperties);
router.post('/properties', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), estateController.createProperty);

module.exports = router;
