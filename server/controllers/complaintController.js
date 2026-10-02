const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { createComplaintSchema } = require('@estate-manager/shared/schemas');

/**
 * Get all complaints / work order tickets with optional filters
 */
exports.getComplaints = async (req, res, next) => {
  try {
    const { estateId, status, priority, category, search } = req.query;
    const where = {};

    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    } else if (estateId && estateId !== 'ALL') {
      where.estateId = estateId;
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (priority && priority !== 'ALL') {
      where.priority = priority;
    }

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { ticketNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { artisanName: { contains: term, mode: 'insensitive' } }
      ];
    }

    const complaints = await prisma.complaint.findMany({
      where,
      include: {
        estate: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, displayIdentifier: true, type: true } },
        resident: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      count: complaints.length,
      data: { complaints }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get aggregated statistics for the maintenance dashboard
 */
exports.getComplaintStats = async (req, res, next) => {
  try {
    const { estateId } = req.query;
    const where = {};
    if (estateId && estateId !== 'ALL') {
      where.estateId = estateId;
    }
    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    }

    const allTickets = await prisma.complaint.findMany({
      where,
      select: {
        status: true,
        priority: true,
        estimatedCost: true,
        actualCost: true,
        dueDate: true
      }
    });

    const now = new Date();
    let total = allTickets.length;
    let openCount = 0;
    let inProgressCount = 0;
    let resolvedCount = 0;
    let slaRiskCount = 0;
    let totalEstimatedCost = 0;
    let totalActualSpend = 0;

    for (const t of allTickets) {
      if (t.status === 'OPEN') openCount++;
      if (t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED' || t.status === 'PENDING_PARTS') inProgressCount++;
      if (t.status === 'RESOLVED' || t.status === 'CLOSED') resolvedCount++;

      // Overdue or critical priority tickets not yet resolved
      const isPastDue = t.dueDate && new Date(t.dueDate) < now;
      if ((t.priority === 'CRITICAL' || t.priority === 'EMERGENCY' || isPastDue) && t.status !== 'RESOLVED' && t.status !== 'CLOSED') {
        slaRiskCount++;
      }

      if (t.estimatedCost) totalEstimatedCost += t.estimatedCost;
      if (t.actualCost) totalActualSpend += t.actualCost;
    }

    res.json({
      success: true,
      data: {
        totalTickets: total,
        openTickets: openCount,
        inProgressTickets: inProgressCount,
        resolvedTickets: resolvedCount,
        slaRiskTickets: slaRiskCount,
        totalEstimatedCost,
        totalActualSpend
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new complaint / work order ticket
 */
exports.createComplaint = async (req, res, next) => {
  try {
    const validated = createComplaintSchema.parse(req.body);
    const ticketNumber = `TCK-${Date.now().toString().slice(-6)}-${crypto.randomInt(10, 99)}`;

    let residentId = validated.residentId;
    if (!residentId) {
      residentId = req.user.id;
    }

    let dueDate = null;
    if (validated.dueDate) {
      dueDate = new Date(validated.dueDate);
    }

    const complaint = await prisma.complaint.create({
      data: {
        ticketNumber,
        estateId: validated.estateId,
        propertyId: validated.propertyId || null,
        residentId,
        title: validated.title,
        description: validated.description,
        category: validated.category || 'General',
        priority: validated.priority || 'MEDIUM',
        location: validated.location || null,
        estimatedCost: validated.estimatedCost ? parseFloat(validated.estimatedCost) : 0,
        dueDate,
        attachments: validated.attachments || []
      },
      include: {
        estate: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, displayIdentifier: true } },
        resident: { select: { id: true, firstName: true, lastName: true, phone: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Maintenance ticket created successfully.',
      data: { complaint }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update ticket status & resolution notes
 */
exports.updateComplaintStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, actualCost } = req.body;

    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'TICKET_NOT_FOUND',
        message: 'Ticket not found.'
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;
    if (actualCost !== undefined) updateData.actualCost = parseFloat(actualCost);

    if (status === 'RESOLVED' || status === 'CLOSED') {
      updateData.resolvedAt = new Date();
    }

    const complaint = await prisma.complaint.update({
      where: { id },
      data: updateData,
      include: {
        estate: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, displayIdentifier: true } },
        resident: { select: { id: true, firstName: true, lastName: true, phone: true } }
      }
    });

    res.json({
      success: true,
      message: 'Ticket status updated successfully.',
      data: { complaint }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign artisan or contractor to a work order ticket
 */
exports.assignComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { artisanName, artisanPhone, artisanSpecialty, assignedToId, dueDate, notes } = req.body;

    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'TICKET_NOT_FOUND',
        message: 'Ticket not found.'
      });
    }

    const updateData = {
      status: 'ASSIGNED'
    };

    if (artisanName) updateData.artisanName = artisanName;
    if (artisanPhone) updateData.artisanPhone = artisanPhone;
    if (artisanSpecialty) updateData.artisanSpecialty = artisanSpecialty;
    if (assignedToId) updateData.assignedToId = assignedToId;
    if (dueDate) updateData.dueDate = new Date(dueDate);
    if (notes) {
      updateData.description = existing.description + `\n\n[Assignment Instructions]: ${notes}`;
    }

    const complaint = await prisma.complaint.update({
      where: { id },
      data: updateData,
      include: {
        estate: { select: { id: true, name: true, code: true } },
        property: { select: { id: true, displayIdentifier: true } },
        resident: { select: { id: true, firstName: true, lastName: true, phone: true } }
      }
    });

    res.json({
      success: true,
      message: 'Artisan assigned successfully.',
      data: { complaint }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get preventive maintenance schedules
 */
exports.getSchedules = async (req, res, next) => {
  try {
    const { estateId } = req.query;
    const where = {};
    if (estateId && estateId !== 'ALL') {
      where.estateId = estateId;
    }

    const schedules = await prisma.maintenanceSchedule.findMany({
      where,
      include: {
        estate: { select: { id: true, name: true, code: true } }
      },
      orderBy: { nextDueDate: 'asc' }
    });

    res.json({
      success: true,
      count: schedules.length,
      data: { schedules }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new preventive maintenance schedule
 */
exports.createSchedule = async (req, res, next) => {
  try {
    const { estateId, title, category, assetName, frequency, nextDueDate, vendorName, vendorPhone, estimatedCost, notes } = req.body;

    if (!estateId || !title || !assetName || !nextDueDate) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Estate ID, title, asset name, and next due date are required.'
      });
    }

    const schedule = await prisma.maintenanceSchedule.create({
      data: {
        estateId,
        title,
        category: category || 'Power',
        assetName,
        frequency: frequency || 'Monthly',
        nextDueDate: new Date(nextDueDate),
        vendorName: vendorName || null,
        vendorPhone: vendorPhone || null,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : 0,
        notes: notes || null
      },
      include: {
        estate: { select: { id: true, name: true, code: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Maintenance schedule created successfully.',
      data: { schedule }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a preventive maintenance schedule status
 */
exports.updateSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, nextDueDate, lastCompletedAt, notes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (nextDueDate) updateData.nextDueDate = new Date(nextDueDate);
    if (lastCompletedAt) updateData.lastCompletedAt = new Date(lastCompletedAt);
    if (notes !== undefined) updateData.notes = notes;

    const schedule = await prisma.maintenanceSchedule.update({
      where: { id },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Schedule updated successfully.',
      data: { schedule }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get vetted artisans directory
 */
exports.getArtisans = async (req, res, next) => {
  try {
    const { estateId, category } = req.query;
    const where = {};
    if (estateId && estateId !== 'ALL') {
      where.OR = [{ estateId }, { estateId: null }];
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }

    const artisans = await prisma.artisan.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      count: artisans.length,
      data: { artisans }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register a new artisan
 */
exports.createArtisan = async (req, res, next) => {
  try {
    const { estateId, name, phone, category } = req.body;
    if (!name || !phone || !category) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name, phone number, and trade category are required.'
      });
    }

    const artisan = await prisma.artisan.create({
      data: {
        estateId: estateId || null,
        name,
        phone,
        category,
        rating: 5.0,
        jobsCount: 0,
        isAvailable: true,
        isVerified: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Artisan registered successfully.',
      data: { artisan }
    });
  } catch (error) {
    next(error);
  }
};
