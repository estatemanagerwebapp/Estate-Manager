const prisma = require('../../lib/prisma');
const { onboardingSyncSchema } = require('@estate-manager/shared/schemas');
const bcrypt = require('bcryptjs');

/**
 * Idempotent Ingestion Engine for External Onboarding Sync
 */
exports.syncOnboarding = async (req, res, next) => {
  try {
    const validated = onboardingSyncSchema.parse(req.body);

    // 1. Locate estate by unique code
    const estate = await prisma.estate.findUnique({ where: { code: validated.estateCode.toUpperCase() } });
    if (!estate) {
      return res.status(404).json({
        success: false,
        error: 'ESTATE_NOT_FOUND',
        message: `Estate with code ${validated.estateCode} does not exist.`
      });
    }

    // 2. Find or create User idempotently
    let user = await prisma.user.findUnique({ where: { email: validated.user.email } });
    let isUserCreated = false;
    if (!user) {
      const defaultPassword = await bcrypt.hash('Welcome123!', 10);
      user = await prisma.user.create({
        data: {
          firstName: validated.user.firstName,
          lastName: validated.user.lastName,
          email: validated.user.email,
          phone: validated.user.phone,
          password: defaultPassword,
          role: 'RESIDENT'
        }
      });
      isUserCreated = true;
    }

    // 3. Find or create Property idempotently
    let property = await prisma.property.findUnique({
      where: {
        estateId_displayIdentifier: {
          estateId: estate.id,
          displayIdentifier: validated.property.unitIdentifier
        }
      }
    });

    let isPropertyCreated = false;
    if (!property) {
      property = await prisma.property.create({
        data: {
          estateId: estate.id,
          type: validated.property.type,
          apartmentNumber: validated.property.unitIdentifier,
          displayIdentifier: validated.property.unitIdentifier,
          occupancyStatus: 'OCCUPIED'
        }
      });
      isPropertyCreated = true;
    }

    // 4. Link User and Property idempotently
    let userProperty = await prisma.userProperty.findUnique({
      where: {
        userId_propertyId: {
          userId: user.id,
          propertyId: property.id
        }
      }
    });

    if (!userProperty) {
      userProperty = await prisma.userProperty.create({
        data: {
          userId: user.id,
          propertyId: property.id,
          estateId: estate.id,
          relationship: validated.property.relationship,
          isPrimary: true
        }
      });
    }

    // 5. Immutable Audit Log for ingestion event
    await prisma.auditLog.create({
      data: {
        action: 'EXTERNAL_ONBOARDING_SYNC',
        targetModel: 'ExternalIntegration',
        targetId: validated.externalId,
        estateId: estate.id,
        details: {
          externalId: validated.externalId,
          userId: user.id,
          propertyId: property.id,
          isUserCreated,
          isPropertyCreated
        },
        performedBy: 'INTEGRATION_ENGINE'
      }
    });

    res.json({
      success: true,
      message: 'Onboarding data synchronized idempotently.',
      data: {
        externalId: validated.externalId,
        userId: user.id,
        propertyId: property.id,
        estateId: estate.id,
        status: 'SYNCED'
      }
    });
  } catch (error) {
    next(error);
  }
};
