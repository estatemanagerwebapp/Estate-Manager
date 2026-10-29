import { describe, expect, it } from 'vitest';
import type { OperatorInvoiceDto, OperatorPaymentDto } from '@silverstone/shared';
import {
  invoiceDisplayStatus,
  invoiceFilterForView,
  invoiceMatchesSearch,
  invoicePropertyLabel,
  invoiceResidentLabel,
  invoiceStatusLabel,
  invoiceTone,
  paymentMatchesSearch,
  paymentResidentLabel,
} from './BillingPage';

function invoice(overrides: Partial<OperatorInvoiceDto> = {}): OperatorInvoiceDto {
  return {
    id: 'invoice-1',
    period: '2026-11',
    amountKobo: 2_500_000,
    currency: 'NGN',
    status: 'UNPAID',
    dueAt: '2026-11-30T00:00:00.000Z',
    issuedAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    overdue: false,
    resident: {
      id: 'resident-1',
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      phone: '+2348000000000',
    },
    property: {
      id: 'property-1',
      identifier: 'A-12',
      name: 'Cedar House',
      estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    },
    paidKobo: 0,
    paymentCount: 0,
    createdBy: {
      id: 'staff-1',
      fullName: 'Grace Bello',
      email: 'grace@example.com',
      role: 'ESTATE_ADMIN',
    },
    voidedAt: null,
    voidedBy: null,
    ...overrides,
  };
}

function payment(overrides: Partial<OperatorPaymentDto> = {}): OperatorPaymentDto {
  return {
    id: 'payment-1',
    invoiceId: 'invoice-1',
    period: '2026-11',
    amountKobo: 2_500_000,
    method: 'BANK_TRANSFER',
    reference: 'TRX-2026-11',
    paidAt: '2026-11-15T00:00:00.000Z',
    createdAt: '2026-11-15T00:00:00.000Z',
    resident: {
      id: 'resident-1',
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      phone: '+2348000000000',
    },
    property: {
      id: 'property-1',
      identifier: 'A-12',
      name: 'Cedar House',
      estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    },
    recordedBy: {
      id: 'staff-1',
      fullName: 'Grace Bello',
      email: 'grace@example.com',
      role: 'ESTATE_ADMIN',
    },
    ...overrides,
  };
}

describe('operator billing helpers', () => {
  it('maps invoice views onto API filters', () => {
    expect(invoiceFilterForView('ALL')).toEqual({});
    expect(invoiceFilterForView('UNPAID')).toEqual({ status: 'UNPAID' });
    expect(invoiceFilterForView('PAID')).toEqual({ status: 'PAID' });
    expect(invoiceFilterForView('OVERDUE')).toEqual({ status: 'OVERDUE' });
    expect(invoiceFilterForView('VOID')).toEqual({ status: 'VOID' });
  });

  it('labels statuses, tones and derived overdue state', () => {
    expect(invoiceStatusLabel('UNPAID')).toBe('Unpaid');
    expect(invoiceStatusLabel('PAID')).toBe('Paid');
    expect(invoiceStatusLabel('OVERDUE')).toBe('Overdue');
    expect(invoiceStatusLabel('VOID')).toBe('Void');
    expect(invoiceTone('UNPAID')).toBe('warning');
    expect(invoiceTone('PAID')).toBe('success');
    expect(invoiceTone('OVERDUE')).toBe('danger');
    expect(invoiceTone('VOID')).toBe('neutral');
    expect(invoiceDisplayStatus(invoice())).toBe('UNPAID');
    expect(invoiceDisplayStatus(invoice({ overdue: true }))).toBe('OVERDUE');
    expect(invoiceDisplayStatus(invoice({ status: 'PAID', overdue: true }))).toBe('PAID');
  });

  it('describes invoice context and searches resident/property/amount', () => {
    expect(invoiceResidentLabel(invoice())).toBe('Ada Okafor');
    expect(invoicePropertyLabel(invoice())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(invoicePropertyLabel(invoice({ property: null }))).toBe('No property assigned');
    expect(invoiceMatchesSearch(invoice(), 'ada')).toBe(true);
    expect(invoiceMatchesSearch(invoice(), 'cedar')).toBe(true);
    expect(invoiceMatchesSearch(invoice(), '25,000')).toBe(true);
    expect(invoiceMatchesSearch(invoice(), 'unrelated')).toBe(false);
  });

  it('describes and searches recorded payments', () => {
    expect(paymentResidentLabel(payment())).toBe('Ada Okafor');
    expect(paymentMatchesSearch(payment(), 'transfer')).toBe(true);
    expect(paymentMatchesSearch(payment(), 'trx-2026')).toBe(true);
    expect(paymentMatchesSearch(payment(), 'cedar')).toBe(true);
    expect(paymentMatchesSearch(payment(), 'unrelated')).toBe(false);
  });
});
