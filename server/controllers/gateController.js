const bcrypt = require('bcryptjs');
const AccessCode = require('../models/AccessCode');
const VerificationLog = require('../models/VerificationLog');
const Estate = require('../models/Estate');
const Notification = require('../models/Notification');
const { verifyAccessCodeSchema } = require('@estate-manager/shared/schemas');
const { ACCESS_CODE_STATUS } = require('@estate-manager/shared/constants/status');

exports.verifyCode = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const validated = verifyAccessCodeSchema.parse(req.body);

    const estate = await Estate.findById(validated.estateId);
    if (!estate) {
      return res.status(404).json({
        success: false,
        error: 'ESTATE_NOT_FOUND',
        message: 'Estate does not exist.'
      });
    }

    // Gate image capture requirement enforcement
    if (estate.gateConfiguration.requireVisitorImage && !validated.visitorImage) {
      return res.status(400).json({
        success: false,
        error: 'VISITOR_IMAGE_REQUIRED',
        message: 'This estate requires a visitor photo to be captured before gate passage.'
      });
    }

    // Find all active codes for this estate that are unexpired
    const now = new Date();
    const activeCodes = await AccessCode.find({
      estateId: validated.estateId,
      status: ACCESS_CODE_STATUS.ACTIVE,
      expiresAt: { $gte: now }
    }).populate('residentId', 'firstName lastName phone')
      .populate('propertyId', 'displayIdentifier type');

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
      await VerificationLog.create({
        estateId: validated.estateId,
        verifiedByGuardId: req.user._id || req.user.id,
        gateAction: 'DENIED',
        visitorName: 'Unknown Visitor',
        guardNotes: `Invalid/expired code attempted: ${validated.code}`,
        visitorImageUrl: validated.visitorImage || null,
        vehicleImageUrl: validated.vehicleImage || null
      });

      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESS_CODE',
        message: 'Access code is invalid, expired, or already used.'
      });
    }

    // Increment usage
    matchedCode.useCount += 1;
    matchedCode.lastUsedAt = new Date();
    if (matchedCode.useCount >= matchedCode.maxUses) {
      matchedCode.status = ACCESS_CODE_STATUS.USED;
    }
    await matchedCode.save();

    // Create entry log
    const verificationLog = await VerificationLog.create({
      accessCodeId: matchedCode._id,
      estateId: matchedCode.estateId,
      propertyId: matchedCode.propertyId._id,
      residentId: matchedCode.residentId._id,
      verifiedByGuardId: req.user._id || req.user.id,
      gateAction: 'ENTRY',
      visitorName: matchedCode.visitorName,
      vehiclePlate: matchedCode.vehiclePlate,
      visitorImageUrl: validated.visitorImage || null,
      vehicleImageUrl: validated.vehicleImage || null,
      guardNotes: validated.guardNotes || null
    });

    // Notify Resident
    await Notification.create({
      userId: matchedCode.residentId._id,
      estateId: matchedCode.estateId,
      title: 'Visitor Arrived at Gate',
      message: `${matchedCode.visitorName} has been verified and cleared for entry at the main gate.`,
      type: 'VISITOR_ARRIVAL',
      data: {
        visitorName: matchedCode.visitorName,
        propertyIdentifier: matchedCode.propertyId.displayIdentifier,
        verifiedAt: verificationLog.verifiedAt
      }
    });

    const elapsedMs = Date.now() - startTime;

    res.json({
      success: true,
      verificationSpeedMs: elapsedMs,
      message: 'Gate access granted.',
      data: {
        visitorName: matchedCode.visitorName,
        destinationUnit: matchedCode.propertyId.displayIdentifier,
        residentName: `${matchedCode.residentId.firstName} ${matchedCode.residentId.lastName}`,
        residentPhone: matchedCode.residentId.phone,
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
    const query = {};
    if (estateId) query.estateId = estateId;

    const logs = await VerificationLog.find(query)
      .populate('propertyId', 'displayIdentifier')
      .populate('verifiedByGuardId', 'firstName lastName')
      .sort({ verifiedAt: -1 })
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      count: logs.length,
      data: { logs }
    });
  } catch (error) {
    next(error);
  }
};
