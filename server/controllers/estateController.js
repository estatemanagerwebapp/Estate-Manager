const Estate = require('../models/Estate');
const Property = require('../models/Property');
const UserProperty = require('../models/UserProperty');
const { propertySchema } = require('@estate-manager/shared/schemas');

exports.getEstates = async (req, res, next) => {
  try {
    const estates = await Estate.find({ isActive: true }).sort({ name: 1 });
    res.json({
      success: true,
      count: estates.length,
      data: { estates }
    });
  } catch (error) {
    next(error);
  }
};

exports.getEstateById = async (req, res, next) => {
  try {
    const estate = await Estate.findById(req.params.id);
    if (!estate) {
      return res.status(404).json({
        success: false,
        error: 'ESTATE_NOT_FOUND',
        message: 'Estate not found.'
      });
    }

    res.json({
      success: true,
      data: { estate }
    });
  } catch (error) {
    next(error);
  }
};

exports.createEstate = async (req, res, next) => {
  try {
    const estate = await Estate.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Estate created successfully.',
      data: { estate }
    });
  } catch (error) {
    next(error);
  }
};

exports.getEstateProperties = async (req, res, next) => {
  try {
    const properties = await Property.find({ estateId: req.params.id }).sort({ displayIdentifier: 1 });
    res.json({
      success: true,
      count: properties.length,
      data: { properties }
    });
  } catch (error) {
    next(error);
  }
};

exports.createProperty = async (req, res, next) => {
  try {
    const validated = propertySchema.parse(req.body);
    const property = await Property.create(validated);
    res.status(201).json({
      success: true,
      message: 'Property created successfully.',
      data: { property }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyProperties = async (req, res, next) => {
  try {
    const userProps = await UserProperty.find({ userId: req.user._id || req.user.id })
      .populate('estateId', 'name code address gateConfiguration')
      .populate('propertyId');

    res.json({
      success: true,
      count: userProps.length,
      data: { properties: userProps }
    });
  } catch (error) {
    next(error);
  }
};
