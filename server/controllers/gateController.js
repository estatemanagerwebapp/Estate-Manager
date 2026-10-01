const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { verifyAccessCodeSchema } = require('@estate-manager/shared/schemas');
const { ACCESS_CODE_STATUS } = require('@estate-manager/shared/constants/status');

exports.verifyCode = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const validated = verifyAccessCodeSchema.parse(req.body);

    const estate = await prisma.estate.findUnique({ where: { id: validated.estateId } });
    if (!estate) {
      return res.status(404).json({
        success: false,
        error: 'ESTATE_NOT_FOUND',
        message: 'Estate does not exist.'
      });
    }

    // Gate image capture requirement enforcement
    if (estate.requireVisitorImage && !validated.visitorImage) {
      return res.status(400).json({
        success: false,
        error: 'VISITOR_IMAGE_REQUIRED',
        message: 'This estate requires a visitor photo to be captured before gate passage.'
      });
    }

    // Find all active codes for this estate that are unexpired
    const now = new Date();
    const activeCodes = await prisma.accessCode.findMany({
      where: {
        estateId: validated.estateId,
        status: ACCESS_CODE_STATUS.ACTIVE,
        expiresAt: { gte: now }
      },
      include: {
        resident: { select: { firstName: true, lastName: true, phone: true } },
        property: { select: { displayIdentifier: true, type: true } }
      }
    });

    let matchedCode = null;
    for (const codeDoc of activeCodes) {
      const match = await bcrypt.compare(validated.code, codeDoc.codeHash);
      if (match) {
        matchedCode = codeDoc;
        break;
      }
    }

    if (!matchedCode) {
      // Record denied verification attempt
      await prisma.verificationLog.create({
        data: {
          estateId: validated.estateId,
          verifiedByGuardId: req.user.id,
          gateAction: 'DENIED',
          visitorName: 'Unknown Visitor',
          guardNotes: `Invalid/expired code attempted: ${validated.code}`,
          visitorImageUrl: validated.visitorImage || null,
          vehicleImageUrl: validated.vehicleImage || null
        }
      });

      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESS_CODE',
        message: 'Access code is invalid, expired, or already used.'
      });
    }

    // Increment usage and update status
    const newUseCount = matchedCode.useCount + 1;
    const newStatus = newUseCount >= matchedCode.maxUses ? 'USED' : 'ACTIVE';

    await prisma.accessCode.update({
      where: { id: matchedCode.id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
        status: newStatus
      }
    });

    // Create entry log
    const verificationLog = await prisma.verificationLog.create({
      data: {
        accessCodeId: matchedCode.id,
        estateId: matchedCode.estateId,
        propertyId: matchedCode.propertyId,
        residentId: matchedCode.residentId,
        verifiedByGuardId: req.user.id,
        gateAction: 'ENTRY',
        visitorName: matchedCode.visitorName,
        vehiclePlate: matchedCode.vehiclePlate,
        visitorImageUrl: validated.visitorImage || null,
        vehicleImageUrl: validated.vehicleImage || null,
        guardNotes: validated.guardNotes || null
      }
    });

    // Notification skipped — Notification model not in Prisma schema
    console.log(`Visitor arrived: ${matchedCode.visitorName} at ${matchedCode.property.displayIdentifier} (resident ${matchedCode.resident.firstName} ${matchedCode.resident.lastName})`);

    const elapsedMs = Date.now() - startTime;

    res.json({
      success: true,
      verificationSpeedMs: elapsedMs,
      message: 'Gate access granted.',
      data: {
        visitorName: matchedCode.visitorName,
        destinationUnit: matchedCode.property.displayIdentifier,
        residentName: `${matchedCode.resident.firstName} ${matchedCode.resident.lastName}`,
        residentPhone: matchedCode.resident.phone,
        vehiclePlate: matchedCode.vehiclePlate,
        accessType: matchedCode.type,
        verifiedAt: verificationLog.verifiedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getGateLogs = async (req, res, next) => {
  try {
    const { estateId, limit = 50 } = req.query;
    const where = {};
    if (estateId) where.estateId = estateId;

    const logs = await prisma.verificationLog.findMany({
      where,
      include: {
        property: { select: { displayIdentifier: true } },
        guard: { select: { firstName: true, lastName: true } }
      },
      orderBy: { verifiedAt: 'desc' },
      take: parseInt(limit, 10)
    });

    res.json({
      success: true,
      count: logs.length,
      data: { logs }
    });
  } catch (error) {
    next(error);
  }
};
