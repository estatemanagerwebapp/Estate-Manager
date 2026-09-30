const crypto = require('crypto');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { INVOICE_STATUS } = require('@estate-manager/shared/constants/status');

exports.getInvoices = async (req, res, next) => {
  try {
    const { estateId, status } = req.query;
    const query = {};

    // If resident, scope to their own records
    if (req.user.role === 'RESIDENT') {
      query.residentId = req.user._id || req.user.id;
    } else if (estateId) {
      query.estateId = estateId;
    }

    if (status) query.status = status;

    const invoices = await Invoice.find(query)
      .populate('estateId', 'name code')
      .populate('propertyId', 'displayIdentifier')
      .populate('residentId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: invoices.length,
      data: { invoices }
    });
  } catch (error) {
    next(error);
  }
};

exports.createInvoice = async (req, res, next) => {
  try {
    const { estateId, propertyId, residentId, title, description, amount, dueDate, items } = req.body;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;

    const invoice = await Invoice.create({
      invoiceNumber,
      estateId,
      propertyId,
      residentId,
      title,
      description,
      amount,
      dueDate,
      items: items || [{ description: title, amount }]
    });

    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully.',
      data: { invoice }
    });
  } catch (error) {
    next(error);
  }
};

exports.payInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, channel = 'CARD' } = req.body;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'Invoice does not exist.'
      });
    }

    const payAmount = amount || (invoice.amount - invoice.paidAmount);
    const paymentRef = `PAY-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const payment = await Payment.create({
      paymentReference: paymentRef,
      invoiceId: invoice._id,
      residentId: req.user._id || req.user.id,
      estateId: invoice.estateId,
      amount: payAmount,
      channel,
      status: 'SUCCESS',
      paidAt: new Date(),
      gatewayResponse: { reference: paymentRef, status: 'success' }
    });

    invoice.paidAmount += payAmount;
    if (invoice.paidAmount >= invoice.amount) {
      invoice.status = INVOICE_STATUS.PAID;
    } else {
      invoice.status = INVOICE_STATUS.PARTIALLY_PAID;
    }
    await invoice.save();

    res.json({
      success: true,
      message: 'Payment processed successfully.',
      data: {
        payment,
        updatedInvoice: invoice
      }
    });
  } catch (error) {
    next(error);
  }
};
