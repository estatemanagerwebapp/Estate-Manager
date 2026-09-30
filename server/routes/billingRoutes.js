const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.get('/invoices', billingController.getInvoices);
router.post('/invoices', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), billingController.createInvoice);
router.post('/invoices/:id/pay', requireRoles(ROLES.RESIDENT, ROLES.SUPER_ADMIN), billingController.payInvoice);

module.exports = router;
