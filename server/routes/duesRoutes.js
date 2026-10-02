const express = require('express');
const router = express.Router();
const duesController = require('../controllers/duesController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

// Fee schedules & collection metrics
router.get('/schedules', duesController.getDuesKPIsAndSchedules);
router.post('/schedules', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), duesController.createFeeSchedule);

// Unit compliance & defaulters ledger
router.get('/ledger', duesController.getUnitComplianceLedger);

// Bulk assessment engine
router.post('/assess', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), duesController.batchAssessDues);

// Reminder dispatch
router.post('/remind', requireRoles(ROLES.SUPER_ADMIN, ROLES.ESTATE_ADMIN), duesController.sendDuesReminder);

module.exports = router;
