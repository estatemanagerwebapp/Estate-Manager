const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');
const authenticate = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { ROLES } = require('@estate-manager/shared/constants/roles');

router.use(authenticate);

// Work Orders / Complaints
router.get('/', complaintController.getComplaints);
router.get('/stats', complaintController.getComplaintStats);
router.post(
  '/',
  requireRoles(ROLES.RESIDENT, ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.createComplaint
);
router.patch(
  '/:id/status',
  requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.updateComplaintStatus
);
router.patch(
  '/:id/assign',
  requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.assignComplaint
);

// Preventive Maintenance Schedules
router.get('/schedules', complaintController.getSchedules);
router.post(
  '/schedules',
  requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.createSchedule
);
router.patch(
  '/schedules/:id',
  requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.updateSchedule
);

// Vetted Artisans Directory
router.get('/artisans', complaintController.getArtisans);
router.post(
  '/artisans',
  requireRoles(ROLES.ESTATE_ADMIN, ROLES.SUPER_ADMIN),
  complaintController.createArtisan
);

module.exports = router;
