const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');
const { createAccessCodeSchema } = require('@estate-manager/shared/schemas');
const { ACCESS_CONTROL_STATUS, ACCESS_CODE_STATUS } = require('@estate-manager/shared/constants/status');

exports.createAccessCode = async (req, res, next) => {
  try {
    // Check resident accessControlStatus (Rule 11, 12)
    const user = await User.findById(req.user._id || req.user.id);
    if (!user || user.accessControlStatus === ACCESS_CONTROL_STATUS.DISABLED) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_CONTROL_DISABLED',
        message: 'Your privilege to generate visitor access codes is currently restricted. Please check your billing dashboard or contact management.'
      });
    }

    // Validate payload (Rule 8: Resident ID is strictly rejected from schema payload)
    const validated = createAccessCodeSchema.parse(req.body);

    // Cryptographically secure 6-digit random code
    const rawCode = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(rawCode, salt);

    const accessCode = await AccessCode.create({
      codeHash,
      codeDisplay: `${rawCode.slice(0, 2)}****`,
      estateId: validated.estateId,
      propertyId: validated.propertyId,
      residentId: req.user._id || req.user.id,
      type: validated.type,
      visitorName: validated.visitorName,
      visitorPhone: validated.visitorPhone,
      vehiclePlate: validated.vehiclePlate,
      validFrom: validated.validFrom ? new Date(validated.validFrom) : new Date(),
      expiresAt: new Date(validated.expiresAt),
      maxUses: validated.maxUses || 1
    });

    res.status(201).json({
      success: true,
      message: 'Access code created successfully.',
      data: {
        codeId: accessCode._id,
        rawCode, // Single-time return of raw verification code
        visitorName: accessCode.visitorName,
        expiresAt: accessCode.expiresAt,
        type: accessCode.type,
        maxUses: accessCode.maxUses
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyAccessCodes = async (req, res, next) => {
  try {
    const codes = await AccessCode.find({ residentId: req.user._id || req.user.id })
      .populate('estateId', 'name code')
      .populate('propertyId', 'displayIdentifier')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: codes.length,
      data: { codes }
    });
  } catch (error) {
    next(error);
  }
};

exports.revokeAccessCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const code = await AccessCode.findOne({
      _id: id,
      residentId: req.user._id || req.user.id
    });

    if (!code) {
      return res.status(404).json({
        success: false,
        error: 'CODE_NOT_FOUND',
        message: 'Access code not found or unauthorized.'
      });
    }

    code.status = ACCESS_CODE_STATUS.REVOKED;
    await code.save();

    res.json({
      success: true,
      message: 'Access code revoked successfully.',
      data: { codeId: code._id }
    });
  } catch (error) {
    next(error);
  }
};
