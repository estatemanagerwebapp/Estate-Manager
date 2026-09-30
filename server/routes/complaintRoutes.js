const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

router.get('/', complaintController.getComplaints);
router.post('/', requireRoles(ROLES.RESIDENT, ROLES.SUPER_ADMIN), complaintController.createComplaint);
router.patch('/:id/status', requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN), complaintController.updateComplaintStatus);

module.exports = router;
