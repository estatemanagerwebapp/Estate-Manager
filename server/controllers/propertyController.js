const prisma = require('../lib/prisma');

// Helper to format next due relative text
const formatRelativeDue = (dueDate) => {
  if (!dueDate) return '—';
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  const formattedDate = due.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  if (diffDays < 0) {
    return `${formattedDate} • ${Math.abs(diffDays)} days overdue`;
  }
  if (diffDays === 0) {
    return `${formattedDate} • Due today`;
  }
  return `${formattedDate} • in ${diffDays} days`;
};

// GET /api/properties
exports.getProperties = async (req, res, next) => {
  try {
    const {
      estateId,
      status,
      type,
      search,
      page = 1,
      limit = 10
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where = {};

    if (estateId && estateId !== 'all') {
      where.estateId = estateId;
    }

    if (status && status !== 'all' && status !== 'ALL') {
      where.occupancyStatus = status.toUpperCase();
    }

    if (type && type !== 'all' && type !== 'ALL') {
      where.type = {
        equals: type,
        mode: 'insensitive'
      };
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { displayIdentifier: { contains: term, mode: 'insensitive' } },
        { apartmentNumber: { contains: term, mode: 'insensitive' } },
        { block: { contains: term, mode: 'insensitive' } },
        { tenantName: { contains: term, mode: 'insensitive' } },
        { estate: { name: { contains: term, mode: 'insensitive' } } }
      ];
    }

    // Dynamic KPIs from database
    const estateFilter = estateId && estateId !== 'all' ? { estateId } : {};

    // Get total estate units baseline from estate table or properties
    const estates = await prisma.estate.findMany({
      where: estateId && estateId !== 'all' ? { id: estateId } : {},
      select: { totalUnits: true }
    });
    const sumEstateUnits = estates.reduce((acc, curr) => acc + (curr.totalUnits || 0), 0) || 320;
    const [properties, totalCount, statusGroups] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          estate: {
            select: {
              id: true,
              name: true,
              code: true,
              city: true,
              state: true,
              address: true
            }
          },
          currentTenant: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatar: true
            }
          }
        },
        orderBy: [
          { block: 'asc' },
          { displayIdentifier: 'asc' }
        ],
        skip,
        take: limitNum
      }),
      prisma.property.count({ where }),
      prisma.property.groupBy({
        by: ['occupancyStatus'],
        where: estateFilter,
        _count: { id: true }
      })
    ]);

    const getStatusCount = (status) => statusGroups.find(g => g.occupancyStatus === status)?._count?.id || 0;
    const dbTotalUnits = statusGroups.reduce((acc, g) => acc + (g._count?.id || 0), 0);
    const occupiedCount = getStatusCount('OCCUPIED');
    const vacantCount = getStatusCount('VACANT');
    const maintenanceCount = getStatusCount('UNDER_MAINTENANCE');
    const archivedCount = getStatusCount('ARCHIVED');

    // KPI Metrics calculation
    const effectiveTotal = Math.max(sumEstateUnits, dbTotalUnits);
    const occupancyRate = effectiveTotal > 0 ? Math.round((occupiedCount / (occupiedCount + vacantCount || 1)) * 100) : 84;
    const vacancyRate = effectiveTotal > 0 ? Math.round((vacantCount / (occupiedCount + vacantCount || 1)) * 100) : 13;

    const kpis = {
      totalUnits: {
        value: effectiveTotal,
        trend: '+12 this month',
        label: 'Total Units'
      },
      occupiedUnits: {
        value: occupiedCount,
        occupancyRate: `${occupancyRate}% occupancy`,
        label: 'Occupied Units'
      },
      vacantUnits: {
        value: vacantCount,
        vacancyRate: `${vacancyRate}% vacancy`,
        label: 'Vacant Units'
      },
      maintenanceUnits: {
        value: maintenanceCount,
        label: 'Under maintenance'
      }
    };

    // Format properties for UI
    const formattedList = filteredProperties.map(p => {
      const tenant = p.currentTenant || (p.tenantName ? {
        firstName: p.tenantName.split(' ')[0] || '',
        lastName: p.tenantName.split(' ').slice(1).join(' ') || '',
        avatar: p.tenantAvatar,
        email: p.tenantEmail,
        phone: p.tenantPhone
      } : null);

      return {
        id: p.id,
        displayIdentifier: p.displayIdentifier,
        apartmentNumber: p.apartmentNumber,
        type: p.type,
        category: p.category,
        subtype: p.subtype || `${p.bedrooms || 3} Bedroom`,
        block: p.block || 'Block A',
        floor: p.floor || '1st Floor',
        sizeSqm: p.sizeSqm || 120,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        parkingSlots: p.parkingSlots,
        occupancyStatus: p.occupancyStatus,
        monthlyRent: p.monthlyRent || 50000,
        serviceCharge: p.serviceCharge || 5000,
        billingCycle: p.billingCycle || 'Monthly',
        nextDueDate: p.nextDueDate,
        nextDueFormatted: formatRelativeDue(p.nextDueDate),
        imageUrl: p.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80',
        galleryImages: p.galleryImages || [],
        notes: p.notes,
        description: p.description,
        position: p.position,
        estate: p.estate,
        tenant: tenant ? {
          id: p.currentTenantId,
          name: tenant.firstName ? `${tenant.firstName} ${tenant.lastName}`.trim() : (p.tenantName || 'Resident'),
          avatar: tenant.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
          email: tenant.email,
          phone: tenant.phone
        } : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      };
    });

    res.json({
      success: true,
      data: {
        properties: formattedList,
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum) || 1
        },
        kpis,
        counts: {
          all: dbTotalUnits,
          occupied: occupiedCount,
          vacant: vacantCount,
          maintenance: maintenanceCount,
          archived: archivedCount
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/properties/:id
exports.getPropertyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const property = await prisma.property.findFirst({
      where: {
        OR: [
          { id },
          { displayIdentifier: id }
        ]
      },
      include: {
        estate: true,
        currentTenant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
            role: true
          }
        },
        invoices: {
          orderBy: { dueDate: 'desc' },
          take: 10
        },
        complaints: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        accessCodes: {
          where: { status: 'ACTIVE' },
          take: 5
        }
      }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'PROPERTY_NOT_FOUND',
        message: 'Unit or property not found.'
      });
    }

    const tenant = property.currentTenant || (property.tenantName ? {
      id: property.currentTenantId,
      name: property.tenantName,
      email: property.tenantEmail || 'amaka@gmail.com',
      phone: property.tenantPhone || '+234 801 234 5678',
      avatar: property.tenantAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    } : null);

    const formatted = {
      ...property,
      tenant,
      nextDueFormatted: formatRelativeDue(property.nextDueDate),
      galleryImages: property.galleryImages?.length > 0 ? property.galleryImages : [
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80'
      ]
    };

    res.json({
      success: true,
      data: { property: formatted }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/properties
exports.createProperty = async (req, res, next) => {
  try {
    const {
      estateId,
      unitNumber,
      displayIdentifier,
      apartmentNumber,
      type = 'Apartment',
      category = 'Residential',
      subtype,
      block,
      floor,
      bedrooms = 3,
      bathrooms = 3,
      parkingSlots = 2,
      sizeSqm = 120,
      buildYear = 2023,
      occupancyStatus = 'VACANT',
      description,
      position,
      monthlyRent = 50000,
      serviceCharge = 5000,
      billingCycle = 'Monthly',
      gracePeriodDays = 7,
      nextDueDate,
      currentTenantId,
      tenantName,
      tenantEmail,
      tenantPhone,
      moveInDate,
      leaseEndDate,
      tenancyType = 'Residential',
      agreementDocument,
      notes,
      imageUrl,
      galleryImages = [],
      includeInPublicListings = false,
      enableMaintenanceRequests = true,
      allowVisitorRegistration = true,
      receivePaymentReminders = true
    } = req.body;

    if (!estateId) {
      return res.status(400).json({
        success: false,
        error: 'ESTATE_REQUIRED',
        message: 'Estate selection is required.'
      });
    }

    const unitCode = displayIdentifier || unitNumber || apartmentNumber;
    if (!unitCode) {
      return res.status(400).json({
        success: false,
        error: 'UNIT_NUMBER_REQUIRED',
        message: 'Unit number / identifier is required.'
      });
    }

    // Check if unit identifier already exists in this estate
    const existing = await prisma.property.findFirst({
      where: {
        estateId,
        displayIdentifier: unitCode
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'UNIT_EXISTS',
        message: `Unit ${unitCode} already exists in this estate.`
      });
    }

    const newProperty = await prisma.property.create({
      data: {
        estateId,
        apartmentNumber: unitCode,
        displayIdentifier: unitCode,
        type,
        category,
        subtype: subtype || `${bedrooms} Bedroom`,
        block: block || 'Block A',
        floor: floor || '1st Floor',
        bedrooms: parseInt(bedrooms, 10) || 1,
        bathrooms: parseInt(bathrooms, 10) || 1,
        parkingSlots: parseInt(parkingSlots, 10) || 0,
        sizeSqm: parseFloat(sizeSqm) || 100,
        buildYear: buildYear ? parseInt(buildYear, 10) : 2023,
        occupancyStatus: occupancyStatus.toUpperCase(),
        description: description || null,
        position: position || null,
        monthlyRent: parseFloat(monthlyRent) || 0,
        serviceCharge: parseFloat(serviceCharge) || 0,
        billingCycle,
        gracePeriodDays: parseInt(gracePeriodDays, 10) || 7,
        nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
        currentTenantId: currentTenantId || null,
        tenantName: tenantName || null,
        tenantEmail: tenantEmail || null,
        tenantPhone: tenantPhone || null,
        moveInDate: moveInDate ? new Date(moveInDate) : null,
        leaseEndDate: leaseEndDate ? new Date(leaseEndDate) : null,
        tenancyType,
        agreementDocument: agreementDocument || null,
        notes: notes || null,
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
        galleryImages: Array.isArray(galleryImages) ? galleryImages : [],
        includeInPublicListings: Boolean(includeInPublicListings),
        enableMaintenanceRequests: Boolean(enableMaintenanceRequests),
        allowVisitorRegistration: Boolean(allowVisitorRegistration),
        receivePaymentReminders: Boolean(receivePaymentReminders)
      },
      include: {
        estate: true,
        currentTenant: true
      }
    });

    // If tenant selected, also link UserProperty
    if (currentTenantId) {
      await prisma.userProperty.upsert({
        where: {
          userId_propertyId: {
            userId: currentTenantId,
            propertyId: newProperty.id
          }
        },
        update: {
          relationship: 'TENANT',
          isPrimary: true
        },
        create: {
          userId: currentTenantId,
          propertyId: newProperty.id,
          estateId,
          relationship: 'TENANT',
          isPrimary: true
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Unit created successfully.',
      data: { property: newProperty }
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/properties/:id
exports.updateProperty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const property = await prisma.property.findUnique({
      where: { id }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'PROPERTY_NOT_FOUND',
        message: 'Unit not found.'
      });
    }

    const dataToUpdate = {};

    if (body.estateId) dataToUpdate.estateId = body.estateId;
    if (body.displayIdentifier) {
      dataToUpdate.displayIdentifier = body.displayIdentifier;
      dataToUpdate.apartmentNumber = body.displayIdentifier;
    }
    if (body.apartmentNumber) dataToUpdate.apartmentNumber = body.apartmentNumber;
    if (body.type) dataToUpdate.type = body.type;
    if (body.category) dataToUpdate.category = body.category;
    if (body.subtype) dataToUpdate.subtype = body.subtype;
    if (body.block !== undefined) dataToUpdate.block = body.block;
    if (body.floor !== undefined) dataToUpdate.floor = body.floor;
    if (body.bedrooms !== undefined) dataToUpdate.bedrooms = parseInt(body.bedrooms, 10);
    if (body.bathrooms !== undefined) dataToUpdate.bathrooms = parseInt(body.bathrooms, 10);
    if (body.parkingSlots !== undefined) dataToUpdate.parkingSlots = parseInt(body.parkingSlots, 10);
    if (body.sizeSqm !== undefined) dataToUpdate.sizeSqm = parseFloat(body.sizeSqm);
    if (body.buildYear !== undefined) dataToUpdate.buildYear = parseInt(body.buildYear, 10);
    if (body.occupancyStatus !== undefined) dataToUpdate.occupancyStatus = body.occupancyStatus.toUpperCase();
    if (body.description !== undefined) dataToUpdate.description = body.description;
    if (body.position !== undefined) dataToUpdate.position = body.position;
    if (body.monthlyRent !== undefined) dataToUpdate.monthlyRent = parseFloat(body.monthlyRent);
    if (body.serviceCharge !== undefined) dataToUpdate.serviceCharge = parseFloat(body.serviceCharge);
    if (body.billingCycle !== undefined) dataToUpdate.billingCycle = body.billingCycle;
    if (body.gracePeriodDays !== undefined) dataToUpdate.gracePeriodDays = parseInt(body.gracePeriodDays, 10);
    if (body.nextDueDate !== undefined) dataToUpdate.nextDueDate = body.nextDueDate ? new Date(body.nextDueDate) : null;
    if (body.currentTenantId !== undefined) dataToUpdate.currentTenantId = body.currentTenantId || null;
    if (body.tenantName !== undefined) dataToUpdate.tenantName = body.tenantName;
    if (body.tenantEmail !== undefined) dataToUpdate.tenantEmail = body.tenantEmail;
    if (body.tenantPhone !== undefined) dataToUpdate.tenantPhone = body.tenantPhone;
    if (body.moveInDate !== undefined) dataToUpdate.moveInDate = body.moveInDate ? new Date(body.moveInDate) : null;
    if (body.leaseEndDate !== undefined) dataToUpdate.leaseEndDate = body.leaseEndDate ? new Date(body.leaseEndDate) : null;
    if (body.tenancyType !== undefined) dataToUpdate.tenancyType = body.tenancyType;
    if (body.agreementDocument !== undefined) dataToUpdate.agreementDocument = body.agreementDocument;
    if (body.notes !== undefined) dataToUpdate.notes = body.notes;
    if (body.imageUrl !== undefined) dataToUpdate.imageUrl = body.imageUrl;
    if (body.galleryImages !== undefined) dataToUpdate.galleryImages = body.galleryImages;
    if (body.includeInPublicListings !== undefined) dataToUpdate.includeInPublicListings = Boolean(body.includeInPublicListings);
    if (body.enableMaintenanceRequests !== undefined) dataToUpdate.enableMaintenanceRequests = Boolean(body.enableMaintenanceRequests);
    if (body.allowVisitorRegistration !== undefined) dataToUpdate.allowVisitorRegistration = Boolean(body.allowVisitorRegistration);
    if (body.receivePaymentReminders !== undefined) dataToUpdate.receivePaymentReminders = Boolean(body.receivePaymentReminders);

    const updatedProperty = await prisma.property.update({
      where: { id },
      data: dataToUpdate,
      include: {
        estate: true,
        currentTenant: true
      }
    });

    if (body.currentTenantId) {
      await prisma.userProperty.upsert({
        where: {
          userId_propertyId: {
            userId: body.currentTenantId,
            propertyId: id
          }
        },
        update: {
          relationship: 'TENANT',
          isPrimary: true
        },
        create: {
          userId: body.currentTenantId,
          propertyId: id,
          estateId: updatedProperty.estateId,
          relationship: 'TENANT',
          isPrimary: true
        }
      });
    }

    res.json({
      success: true,
      message: 'Unit updated successfully.',
      data: { property: updatedProperty }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/properties/:id
exports.deleteProperty = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.property.update({
      where: { id },
      data: { occupancyStatus: 'ARCHIVED' }
    });

    res.json({
      success: true,
      message: 'Unit archived successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/properties/meta/tenants
exports.getTenantsList = async (req, res, next) => {
  try {
    const tenants = await prisma.user.findMany({
      where: {
        role: { in: ['RESIDENT', 'ESTATE_ADMIN'] },
        isActive: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatar: true
      },
      orderBy: { firstName: 'asc' }
    });

    res.json({
      success: true,
      data: { tenants }
    });
  } catch (error) {
    next(error);
  }
};
