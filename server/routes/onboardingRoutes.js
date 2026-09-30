const express = require('express');
const router = express.Router();
const onboardingController = require('../integrations/onboarding/onboardingController');
const config = require('../config/env');

// Webhook / HMAC / API token verification middleware for external ingestion
const verifyIntegrationWebhook = (req, res, next) => {
  const secret = req.headers['x-onboarding-secret'] || req.headers['x-api-key'];
  if (config.env === 'production' && secret !== config.onboardingWebhookSecret) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED_INTEGRATION_SOURCE',
      message: 'Invalid or missing integration key.'
    });
  }
  next();
};

router.post('/sync', verifyIntegrationWebhook, onboardingController.syncOnboarding);
router.post('/push', verifyIntegrationWebhook, onboardingController.syncOnboarding);

module.exports = router;
