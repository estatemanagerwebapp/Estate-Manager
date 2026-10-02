const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.get('/invoices', billingController.getInvoices);
router.get('/invoices/:id', billingController.getInvoiceById);
router.post('/invoices', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), billingController.createInvoice);
router.post('/invoices/:id/pay', requireRoles(ROLES.RESIDENT, ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), billingController.payInvoice);
router.post('/invoices/:id/record-payment', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), billingController.recordPayment);
router.get('/payments', billingController.getPayments);

module.exports = router;
