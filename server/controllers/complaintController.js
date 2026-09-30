const crypto = require('crypto');
const Complaint = require('../models/Complaint');
const { createComplaintSchema } = require('@estate-manager/shared/schemas');

exports.getComplaints = async (req, res, next) => {
  try {
    const { estateId, status } = req.query;
    const query = {};

    if (req.user.role === 'RESIDENT') {
      query.residentId = req.user._id || req.user.id;
    } else if (estateId) {
      query.estateId = estateId;
    }

    if (status) query.status = status;

    const complaints = await Complaint.find(query)
      .populate('estateId', 'name code')
      .populate('propertyId', 'displayIdentifier')
      .populate('residentId', 'firstName lastName phone')
      .sort({ createdAt: -1 });

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

    const complaint = await Complaint.create({
      ticketNumber,
      estateId: validated.estateId,
      propertyId: validated.propertyId,
      residentId: req.user._id || req.user.id,
      title: validated.title,
      description: validated.description,
      priority: validated.priority,
      attachments: validated.attachments || []
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

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: 'TICKET_NOT_FOUND',
        message: 'Ticket not found.'
      });
    }

    complaint.status = status;
    if (resolutionNotes) complaint.resolutionNotes = resolutionNotes;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      complaint.resolvedAt = new Date();
    }
    await complaint.save();

    res.json({
      success: true,
      message: 'Ticket status updated successfully.',
      data: { complaint }
    });
  } catch (error) {
    next(error);
  }
};
