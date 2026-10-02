const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { INVOICE_STATUS } = require('@estate-manager/shared/constants/status');

exports.getInvoices = async (req, res, next) => {
  try {
    const { estateId, status, search } = req.query;
    const where = {};

    // If resident, scope to their own records
    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    } else if (estateId && estateId !== 'ALL') {
      where.estateId = estateId;
    }

    const now = new Date();

    if (status && status !== 'ALL') {
      if (status === 'OVERDUE') {
        where.OR = [
          { status: 'OVERDUE' },
          {
            status: { notIn: ['PAID', 'CANCELLED'] },
            dueDate: { lt: now }
          }
        ];
      } else if (status === 'PAID') {
        where.status = 'PAID';
      } else if (status === 'PENDING') {
        where.status = { in: ['PENDING', 'PARTIALLY_PAID'] };
      } else {
        where.status = status;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        estate: { select: { id: true, name: true, code: true, address: true, city: true, state: true } },
        property: { select: { id: true, displayIdentifier: true, block: true, apartmentNumber: true, type: true } },
        resident: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, residentCode: true } },
        payments: { orderBy: { paidAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enrichedInvoices = invoices.map(inv => {
      const isPastDue = inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'PAID' && inv.status !== 'CANCELLED';
      return {
        ...inv,
        status: isPastDue ? 'OVERDUE' : inv.status,
        isOverdue: isPastDue
      };
    });

    // Compute live stats across all visible invoices
    const allInvoices = await prisma.invoice.findMany({
      where: req.user.role === 'RESIDENT' ? { residentId: req.user.id } : (estateId && estateId !== 'ALL' ? { estateId } : {}),
      include: { payments: true }
    });

    let totalInvoiced = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    for (const inv of allInvoices) {
      totalInvoiced += inv.amount || 0;
      totalPaid += inv.paidAmount || 0;
      if (inv.status === 'PAID') {
        paidCount++;
      } else if (inv.status === 'OVERDUE' || (inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'PAID')) {
        overdueCount++;
      } else {
        pendingCount++;
      }
    }

    const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

    // Apply search filter in-memory if search parameter is passed
    let filteredInvoices = enrichedInvoices;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredInvoices = invoices.filter(inv => {
        const invNum = (inv.invoiceNumber || '').toLowerCase();
        const title = (inv.title || '').toLowerCase();
        const residentName = `${inv.resident?.firstName || ''} ${inv.resident?.lastName || ''}`.toLowerCase();
        const unit = (inv.property?.displayIdentifier || '').toLowerCase();
        const estate = (inv.estate?.name || '').toLowerCase();
        return invNum.includes(q) || title.includes(q) || residentName.includes(q) || unit.includes(q) || estate.includes(q);
      });
    }

    res.json({
      success: true,
      count: filteredInvoices.length,
      data: {
        invoices: filteredInvoices,
        stats: {
          totalInvoiced,
          totalPaid,
          totalOutstanding,
          paidCount,
          pendingCount,
          overdueCount,
          totalCount: allInvoices.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getInvoiceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        estate: true,
        property: true,
        resident: true,
        payments: { orderBy: { paidAt: 'desc' } }
      }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.'
      });
    }

    // Security check: residents can only view their own invoices
    if (req.user.role === 'RESIDENT' && invoice.residentId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You are not authorized to view this invoice.'
      });
    }

    res.json({
      success: true,
      data: { invoice }
    });
  } catch (error) {
    next(error);
  }
};

exports.createInvoice = async (req, res, next) => {
  try {
    const {
      estateId,
      propertyId,
      residentId,
      title,
      description,
      amount,
      dueDate,
      items,
      paymentInstructions
    } = req.body;

    if (!estateId || !propertyId || !residentId || !title || !amount || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Estate, Property, Resident, Title, Amount, and Due Date are required.'
      });
    }

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;

    const parsedAmount = parseFloat(amount);
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        estateId,
        propertyId,
        residentId,
        title,
        description: description || paymentInstructions || null,
        amount: parsedAmount,
        dueDate: new Date(dueDate),
        items: items && items.length > 0 ? items : [{ description: title, quantity: 1, unitPrice: parsedAmount, amount: parsedAmount }]
      },
      include: {
        estate: { select: { id: true, name: true, code: true, address: true } },
        property: { select: { id: true, displayIdentifier: true, block: true } },
        resident: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }
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

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { estate: true, property: true, resident: true }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'Invoice does not exist.'
      });
    }

    const payAmount = parseFloat(amount) || (invoice.amount - invoice.paidAmount);
    const paymentRef = `PAY-REF-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;

    const payment = await prisma.payment.create({
      data: {
        paymentReference: paymentRef,
        invoiceId: invoice.id,
        residentId: req.user.role === 'RESIDENT' ? req.user.id : invoice.residentId,
        estateId: invoice.estateId,
        amount: payAmount,
        channel,
        status: 'SUCCESS',
        paidAt: new Date()
      }
    });

    const newPaidAmount = invoice.paidAmount + payAmount;
    const newStatus = newPaidAmount >= invoice.amount ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        paidAmount: { increment: payAmount },
        status: newStatus
      },
      include: {
        estate: true,
        property: true,
        resident: true,
        payments: { orderBy: { paidAt: 'desc' } }
      }
    });

    res.json({
      success: true,
      message: 'Payment recorded successfully.',
      data: {
        payment,
        invoice: updatedInvoice
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.recordPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, channel = 'BANK_TRANSFER', reference, notes, paidAt } = req.body;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { estate: true, property: true, resident: true }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'Invoice does not exist.'
      });
    }

    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: 'Please provide a valid payment amount.'
      });
    }

    const paymentRef = reference && reference.trim() 
      ? reference.trim() 
      : `PAY-MANUAL-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;

    const payment = await prisma.payment.create({
      data: {
        paymentReference: paymentRef,
        invoiceId: invoice.id,
        residentId: invoice.residentId,
        estateId: invoice.estateId,
        amount: payAmount,
        channel,
        status: 'SUCCESS',
        paidAt: paidAt ? new Date(paidAt) : new Date()
      }
    });

    const newPaidAmount = invoice.paidAmount + payAmount;
    const newStatus = newPaidAmount >= invoice.amount ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        paidAmount: { increment: payAmount },
        status: newStatus
      },
      include: {
        estate: true,
        property: true,
        resident: true,
        payments: { orderBy: { paidAt: 'desc' } }
      }
    });

    res.json({
      success: true,
      message: 'Payment recorded successfully.',
      data: {
        payment,
        invoice: updatedInvoice
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getPayments = async (req, res, next) => {
  try {
    const { estateId } = req.query;
    const where = {};

    if (req.user.role === 'RESIDENT') {
      where.residentId = req.user.id;
    } else if (estateId && estateId !== 'ALL') {
      where.estateId = estateId;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        estate: { select: { name: true, code: true, address: true } },
        resident: { select: { firstName: true, lastName: true, email: true, phone: true, residentCode: true } },
        invoice: { select: { invoiceNumber: true, title: true, amount: true, dueDate: true } }
      },
      orderBy: { paidAt: 'desc' }
    });

    res.json({
      success: true,
      count: payments.length,
      data: { payments }
    });
  } catch (error) {
    next(error);
  }
};
