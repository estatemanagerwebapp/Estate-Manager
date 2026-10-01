const prisma = require('../lib/prisma');
const { propertySchema } = require('@estate-manager/shared/schemas');

exports.getEstates = async (req, res, next) => {
  try {
    const estates = await prisma.estate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
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
    const estate = await prisma.estate.findUnique({ where: { id: req.params.id } });
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
    const estate = await prisma.estate.create({ data: req.body });
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
    const properties = await prisma.property.findMany({
      where: { estateId: req.params.id },
      orderBy: { displayIdentifier: 'asc' }
    });
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
    const property = await prisma.property.create({ data: validated });
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
    const userProps = await prisma.userProperty.findMany({
      where: { userId: req.user.id },
      include: {
        estate: { select: { name: true, code: true, address: true, requireVisitorImage: true, requireVehicleImage: true } },
        property: true
      }
    });

    res.json({
      success: true,
      count: userProps.length,
      data: { properties: userProps }
    });
  } catch (error) {
    next(error);
  }
};
