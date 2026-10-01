const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const estateRoutes = require('./estateRoutes');
const codeRoutes = require('./codeRoutes');
const gateRoutes = require('./gateRoutes');
const billingRoutes = require('./billingRoutes');
const complaintRoutes = require('./complaintRoutes');
const propertyRoutes = require('./propertyRoutes');
const residentRoutes = require('./residentRoutes');
const onboardingRoutes = require('./onboardingRoutes');
const dashboardRoutes = require('./dashboardRoutes');

// API Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Estate Manager Core API',
    timestamp: new Date().toISOString()
  });
});

router.use('/dashboard', dashboardRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/estates', estateRoutes);
router.use('/properties', propertyRoutes);
router.use('/residents', residentRoutes);
router.use('/codes', codeRoutes);
router.use('/gate', gateRoutes);
router.use('/billing', billingRoutes);
router.use('/complaints', complaintRoutes);
router.use('/integrations/onboarding', onboardingRoutes);

module.exports = router;
