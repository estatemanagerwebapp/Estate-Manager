const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Summary endpoint for the EstatePro Executive Command Center
router.get('/summary', dashboardController.getDashboardSummary);

module.exports = router;
