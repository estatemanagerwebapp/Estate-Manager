const User = require('../../models/User');
const Estate = require('../../models/Estate');
const Property = require('../../models/Property');
const UserProperty = require('../../models/UserProperty');
const AuditLog = require('../../models/AuditLog');
const { onboardingSyncSchema } = require('@estate-manager/shared/schemas');
const bcrypt = require('bcryptjs');

/**
 * Idempotent Ingestion Engine for External Onboarding Sync
 */
exports.syncOnboarding = async (req, res, next) => {
  try {
    const validated = onboardingSyncSchema.parse(req.body);

    // 1. Locate estate by unique code
    const estate = await Estate.findOne({ code: validated.estateCode.toUpperCase() });
    if (!estate) {
      return res.status(404).json({
        success: false,
        error: 'ESTATE_NOT_FOUND',
        message: `Estate with code ${validated.estateCode} does not exist.`
      });
    }

    // 2. Find or create User idempotently
    let user = await User.findOne({ email: validated.user.email });
    let isUserCreated = false;
    if (!user) {
      const defaultPassword = await bcrypt.hash('Welcome123!', 10);
      user = await User.create({
        firstName: validated.user.firstName,
        lastName: validated.user.lastName,
        email: validated.user.email,
        phone: validated.user.phone,
        password: defaultPassword,
        role: 'RESIDENT'
      });
      isUserCreated = true;
    }

    // 3. Find or create Property idempotently
    let property = await Property.findOne({
      estateId: estate._id,
      displayIdentifier: validated.property.unitIdentifier
    });

    let isPropertyCreated = false;
    if (!property) {
      property = await Property.create({
        estateId: estate._id,
        type: validated.property.type,
        apartmentNumber: validated.property.unitIdentifier,
        displayIdentifier: validated.property.unitIdentifier,
        occupancyStatus: 'OCCUPIED'
      });
      isPropertyCreated = true;
    }

    // 4. Link User and Property idempotently
    let userProperty = await UserProperty.findOne({
      userId: user._id,
      propertyId: property._id
    });

    if (!userProperty) {
      userProperty = await UserProperty.create({
        userId: user._id,
        propertyId: property._id,
        estateId: estate._id,
        relationship: validated.property.relationship,
        isPrimary: true
      });
    }

    // 5. Immutable Audit Log for ingestion event
    await AuditLog.create({
      action: 'EXTERNAL_ONBOARDING_SYNC',
      targetModel: 'ExternalIntegration',
      targetId: validated.externalId,
      estateId: estate._id.toString(),
      details: {
        externalId: validated.externalId,
        userId: user._id.toString(),
        propertyId: property._id.toString(),
        isUserCreated,
        isPropertyCreated
      },
      performedBy: 'INTEGRATION_ENGINE'
    });

    res.json({
      success: true,
      message: 'Onboarding data synchronized idempotently.',
      data: {
        externalId: validated.externalId,
        userId: user._id,
        propertyId: property._id,
        estateId: estate._id,
        status: 'SYNCED'
      }
    });
  } catch (error) {
    next(error);
  }
};
