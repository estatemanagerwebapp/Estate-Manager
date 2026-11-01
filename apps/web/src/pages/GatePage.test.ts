import { describe, expect, it } from 'vitest';
import type {
  AccessVerificationDto,
  OperatorAccessCodeDto,
  OperatorVerifyAccessCodePreview,
} from '@silverstone/shared';
import {
  accessCodeDisplayStatus,
  accessCodeFilterForView,
  accessCodeMatchesSearch,
  accessCodePropertyLabel,
  accessCodeResidentLabel,
  accessCodeStatusLabel,
  accessCodeTone,
  accessCodeVisitorDetail,
  accessCodeVisitorLabel,
  confirmVerificationLabel,
  idDocumentHref,
  previewOutcomeLabel,
  verificationFilterForView,
  verificationMatchesSearch,
  verificationOutcomeLabel,
  verificationOutcomeTone,
  verificationPropertyLabel,
  verificationReasonLabel,
  verificationResidentLabel,
} from './GatePage';

function code(overrides: Partial<OperatorAccessCodeDto> = {}): OperatorAccessCodeDto {
  return {
    id: 'code-1',
    kind: 'ENTRY',
    status: 'ACTIVE',
    codePrefix: 'ABCD',
    validUntil: '2027-01-01T00:00:00.000Z',
    issuedAt: '2026-11-01T00:00:00.000Z',
    revokedAt: null,
    visitorName: 'Chinedu Okafor',
    carPlate: 'LAG-123-AA',
    idDocumentUrl: '/api/v1/media/org-1/media-1',
    authenticationType: 'ID_IMAGE',
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
    ...overrides,
  };
}

function verification(overrides: Partial<AccessVerificationDto> = {}): AccessVerificationDto {
  return {
    id: 'verification-1',
    accessCodeId: 'code-1',
    gate: 'ENTRY',
    outcome: 'GRANTED',
    reason: null,
    codePrefix: 'ABCD',
    occurredAt: '2026-11-15T08:30:00.000Z',
    visitorName: 'Chinedu Okafor',
    carPlate: 'LAG-123-AA',
    idDocumentUrl: '/api/v1/media/org-1/media-1',
    authenticationType: 'ID_IMAGE',
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
    verifiedBy: {
      id: 'guard-1',
      fullName: 'Gate Guard',
      email: 'guard@example.com',
      role: 'GUARD',
    },
    ...overrides,
  };
}

describe('gate page helpers', () => {
  it('maps views to API filters', () => {
    expect(accessCodeFilterForView('ALL')).toEqual({});
    expect(accessCodeFilterForView('EXPIRED')).toEqual({ status: 'EXPIRED' });
    expect(verificationFilterForView('ALL', 'ALL')).toEqual({});
    expect(verificationFilterForView('DENIED', 'EXIT')).toEqual({
      outcome: 'DENIED',
      gate: 'EXIT',
    });
  });

  it('derives expired status and maps labels and tones', () => {
    const now = new Date('2026-11-15T00:00:00.000Z');
    expect(accessCodeDisplayStatus(code(), now)).toBe('ACTIVE');
    expect(accessCodeDisplayStatus(code({ validUntil: '2026-11-01T00:00:00.000Z' }), now)).toBe(
      'EXPIRED',
    );
    expect(accessCodeDisplayStatus(code({ status: 'REVOKED', validUntil: null }), now)).toBe(
      'REVOKED',
    );
    expect(accessCodeStatusLabel('ACTIVE')).toBe('Active');
    expect(accessCodeTone('ACTIVE')).toBe('success');
    expect(accessCodeTone('EXPIRED')).toBe('warning');
    expect(accessCodeTone('REVOKED')).toBe('danger');
  });

  it('maps verification outcomes and denial reasons', () => {
    expect(verificationOutcomeLabel('GRANTED')).toBe('Granted');
    expect(verificationOutcomeLabel('DENIED')).toBe('Denied');
    expect(verificationOutcomeTone('GRANTED')).toBe('success');
    expect(verificationOutcomeTone('DENIED')).toBe('danger');
    expect(verificationReasonLabel(null)).toBe('—');
    expect(verificationReasonLabel('NOT_FOUND')).toBe('Code not found');
    expect(verificationReasonLabel('WRONG_DIRECTION')).toBe('Wrong gate direction');
  });

  it('builds resident and property labels with safe fallbacks', () => {
    expect(accessCodeResidentLabel(code())).toBe('Ada Okafor');
    expect(accessCodePropertyLabel(code())).toBe('A-12 · Cedar House · Silverstone Estate');
    expect(accessCodeResidentLabel(code({ resident: null }))).toBe('Resident account unavailable');
    expect(accessCodePropertyLabel(code({ property: null }))).toBe('No property assigned');
    expect(verificationResidentLabel(verification())).toBe('Ada Okafor');
    expect(verificationPropertyLabel(verification({ property: null }))).toBe('No property context');
    expect(verificationResidentLabel(verification({ resident: null, reason: 'NOT_FOUND' }))).toBe(
      'Unknown code',
    );
  });

  it('searches access codes and verification attempts', () => {
    expect(accessCodeMatchesSearch(code(), 'ada')).toBe(true);
    expect(accessCodeMatchesSearch(code(), 'abcd')).toBe(true);
    expect(accessCodeMatchesSearch(code(), 'entry only')).toBe(true);
    expect(accessCodeMatchesSearch(code(), 'revoked')).toBe(false);
    expect(accessCodeMatchesSearch(code(), '')).toBe(true);

    expect(verificationMatchesSearch(verification(), 'ada')).toBe(true);
    expect(verificationMatchesSearch(verification(), 'granted')).toBe(true);
    expect(verificationMatchesSearch(verification(), 'gate guard')).toBe(true);
    expect(
      verificationMatchesSearch(
        verification({ outcome: 'DENIED', reason: 'WRONG_DIRECTION' }),
        'wrong gate',
      ),
    ).toBe(true);
    expect(verificationMatchesSearch(verification(), 'not found')).toBe(false);
  });

  it('shows visitor credentials and builds inline ID links', () => {
    expect(accessCodeVisitorLabel(code())).toBe('Chinedu Okafor');
    expect(accessCodeVisitorDetail(code())).toBe('Chinedu Okafor · LAG-123-AA');
    expect(accessCodeVisitorLabel(code({ visitorName: null }))).toBe('Visitor not recorded');
    expect(accessCodeVisitorDetail(code({ visitorName: null, carPlate: null }))).toBe('—');
    expect(accessCodeMatchesSearch(code(), 'chinedu')).toBe(true);
    expect(accessCodeMatchesSearch(code(), 'lag-123')).toBe(true);
    expect(verificationMatchesSearch(verification(), 'lag-123')).toBe(true);
    expect(idDocumentHref('/api/v1/media/org/media')).toBe('/api/v1/media/org/media?inline=1');
    expect(idDocumentHref('/api/v1/media/org/media?x=1')).toBe(
      '/api/v1/media/org/media?x=1&inline=1',
    );
    expect(idDocumentHref(null)).toBeNull();
  });

  it('labels the pre-commit review and its confirmation action', () => {
    function preview(
      overrides: Partial<OperatorVerifyAccessCodePreview> = {},
    ): OperatorVerifyAccessCodePreview {
      return {
        found: true,
        outcome: 'GRANTED',
        reason: null,
        gate: 'ENTRY',
        codePrefix: 'ABCD',
        kind: 'ENTRY',
        status: 'ACTIVE',
        validUntil: '2026-11-01T12:00:00.000Z',
        issuedAt: '2026-11-01T08:00:00.000Z',
        visitorName: 'Chinedu Okafor',
        carPlate: 'LAG-123-AA',
        idDocumentUrl: null,
        authenticationType: 'ID_IMAGE',
        resident: null,
        property: null,
        accessCodeId: 'code-1',
        ...overrides,
      };
    }

    expect(previewOutcomeLabel(preview())).toBe('Access would be granted');
    expect(confirmVerificationLabel(preview())).toBe('Confirm entry');
    expect(confirmVerificationLabel(preview({ gate: 'EXIT' }))).toBe('Confirm exit');

    const denied = preview({ outcome: 'DENIED', reason: 'EXPIRED', status: 'EXPIRED' });
    expect(previewOutcomeLabel(denied)).toBe('Access would be denied');
    expect(confirmVerificationLabel(denied)).toBe('Record denied attempt');

    const unknown = preview({
      found: false,
      outcome: 'DENIED',
      reason: 'NOT_FOUND',
      accessCodeId: null,
      kind: null,
      status: null,
      validUntil: null,
      issuedAt: null,
    });
    expect(previewOutcomeLabel(unknown)).toBe('No matching code');
    expect(confirmVerificationLabel(unknown)).toBe('Record denied attempt');
  });
});
