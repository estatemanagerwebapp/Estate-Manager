const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { INVOICE_STATUS } = require('@estate-manager/shared/constants/status');

exports.getInvoices = async (req, res, next) => {
  try {
    const { estateId, status } = req.query;
    const where = {};

    // If resident, scope to their own records
    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    } else if (estateId) {
      where.estateId = estateId;
    }

    if (status) where.status = status;

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        estate: { select: { name: true, code: true } },
        property: { select: { displayIdentifier: true } },
        resident: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

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

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        estateId,
        propertyId,
        residentId,
        title,
        description,
        amount,
        dueDate: new Date(dueDate),
        items: items || [{ description: title, amount }]
      }
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

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'Invoice does not exist.'
      });
    }

    const payAmount = amount || (invoice.amount - invoice.paidAmount);
    const paymentRef = `PAY-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const payment = await prisma.payment.create({
      data: {
        paymentReference: paymentRef,
        invoiceId: invoice.id,
        residentId: req.user.id,
        estateId: invoice.estateId,
        amount: payAmount,
        channel,
        status: 'SUCCESS',
        paidAt: new Date()
      }
    });

    // Compute new status before update
    const newPaidAmount = invoice.paidAmount + payAmount;
    const newStatus = newPaidAmount >= invoice.amount ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        paidAmount: { increment: payAmount },
        status: newStatus
      }
    });

    res.json({
      success: true,
      message: 'Payment processed successfully.',
      data: {
        payment,
        updatedInvoice
      }
    });
  } catch (error) {
    next(error);
  }
};
