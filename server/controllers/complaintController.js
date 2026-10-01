const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { createComplaintSchema } = require('@estate-manager/shared/schemas');

exports.getComplaints = async (req, res, next) => {
  try {
    const { estateId, status } = req.query;
    const where = {};

    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    } else if (estateId) {
      where.estateId = estateId;
    }

    if (status) where.status = status;

    const complaints = await prisma.complaint.findMany({
      where,
      include: {
        estate: { select: { name: true, code: true } },
        property: { select: { displayIdentifier: true } },
        resident: { select: { firstName: true, lastName: true, phone: true } }
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

exports.createComplaint = async (req, res, next) => {
  try {
    const validated = createComplaintSchema.parse(req.body);
    const ticketNumber = `TCK-${Date.now().toString().slice(-6)}-${crypto.randomInt(10, 99)}`;

    const complaint = await prisma.complaint.create({
      data: {
        ticketNumber,
        estateId: validated.estateId,
        propertyId: validated.propertyId,
        residentId: req.user.id,
        title: validated.title,
        description: validated.description,
        priority: validated.priority
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

exports.updateComplaintStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;

    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'TICKET_NOT_FOUND',
        message: 'Ticket not found.'
      });
    }

    const updateData = { status };
    if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      updateData.resolvedAt = new Date();
    }

    const complaint = await prisma.complaint.update({
      where: { id },
      data: updateData
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
