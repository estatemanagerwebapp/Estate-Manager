/**
 * Guard home tests.
 *
 * The page is driven entirely by `useGuardOverview`, so the render tests stub
 * that hook and assert the two things a gateman needs — SOS and the gate — plus
 * the permission fallbacks for sections the server returns as `null`.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type {
  AccessVerificationDto,
  GuardOverviewDto,
  OperatorAccessCodeDto,
  Permission,
  SosOperatorEventDto,
  UserDto,
} from '@silverstone/shared';
import type { useGuardOverview } from '../api/hooks';
import { GuardOverviewPage, expectedVisitorDetail, guardCounters } from './GuardOverviewPage';

let mockOverview: ReturnType<typeof useGuardOverview> | null = null;
let mockUser: UserDto | null = null;
let mockCan: Partial<Record<Permission, boolean>> = {};

vi.mock('../api/hooks', () => ({
  useGuardOverview: () => mockOverview,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
  canManageUsers: () => false,
}));

vi.mock('../auth/useCan', () => ({
  useCan: () => mockCan,
}));

function user(role: UserDto['role'] = 'GUARD'): UserDto {
  return {
    id: 'user-1',
    email: 'guard@example.com',
    phone: null,
    fullName: 'Gate Guard',
    role,
    mustChangePassword: false,
    permissions: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPasswordChangedAt: null,
  };
}

function code(overrides: Partial<OperatorAccessCodeDto> = {}): OperatorAccessCodeDto {
  return {
    id: 'code-1',
    kind: 'ENTRY',
    status: 'ACTIVE',
    codePrefix: 'ABCD',
    validUntil: '2026-06-15T15:00:00.000Z',
    issuedAt: '2026-06-15T08:00:00.000Z',
    revokedAt: null,
    visitorName: 'Chinedu Okafor',
    carPlate: 'LAG-123-AA',
    idDocumentUrl: null,
    authenticationType: 'ID_IMAGE',
    resident: {
      id: 'resident-1',
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      phone: null,
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
    occurredAt: '2026-06-15T08:30:00.000Z',
    visitorName: 'Chinedu Okafor',
    carPlate: 'LAG-123-AA',
    idDocumentUrl: null,
    authenticationType: 'ID_IMAGE',
    resident: null,
    property: null,
    verifiedBy: null,
    ...overrides,
  };
}

function sosEvent(overrides: Partial<SosOperatorEventDto> = {}): SosOperatorEventDto {
  return {
    id: 'sos-1',
    note: 'Intruder at the back gate',
    status: 'RAISED',
    raisedAt: '2026-06-15T09:00:00.000Z',
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    resident: {
      id: 'resident-1',
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      phone: null,
    },
    property: {
      id: 'property-1',
      identifier: 'A-12',
      name: 'Cedar House',
      estate: { id: 'estate-1', name: 'Silverstone Estate', slug: 'silverstone' },
    },
    acknowledgedBy: null,
    resolvedBy: null,
    ...overrides,
  };
}

function overview(overrides: Partial<GuardOverviewDto> = {}): GuardOverviewDto {
  return {
    activeSos: 1,
    activeSosEvents: [sosEvent()],
    expectedToday: [code()],
    verificationsToday: { granted: 3, denied: 1 },
    recentVerifications: [verification()],
    generatedAt: '2026-06-15T12:00:00.000Z',
    ...overrides,
  };
}

function setOverview(value: Partial<GuardOverviewDto> | null = {}, loading = false) {
  mockOverview = {
    overview: value === null ? null : overview(value),
    loading,
    fetching: false,
    error: null,
    errorObject: null,
    refresh: vi.fn(),
  };
}

function renderPage() {
  mockUser = user();
  mockCan = { 'gate.manage': true };
  return render(
    <MemoryRouter>
      <GuardOverviewPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mockOverview = null;
  mockUser = null;
  mockCan = {};
});

describe('guardCounters', () => {
  it('reads the expected/granted/denied counts', () => {
    expect(guardCounters(overview())).toEqual({ expected: 1, granted: 3, denied: 1 });
  });

  it('returns null for a hidden section instead of zero', () => {
    expect(
      guardCounters(
        overview({
          expectedToday: null,
          verificationsToday: null,
        }),
      ),
    ).toEqual({ expected: null, granted: null, denied: null });
    expect(guardCounters(null)).toEqual({ expected: null, granted: null, denied: null });
  });
});

describe('expectedVisitorDetail', () => {
  it('combines property and resident', () => {
    expect(expectedVisitorDetail(code())).toBe('A-12 · Cedar House — Ada Okafor');
  });

  it('falls back when context is missing', () => {
    expect(expectedVisitorDetail(code({ property: null, resident: null }))).toBe(
      'Property not recorded',
    );
  });
});

describe('GuardOverviewPage', () => {
  it('puts the active SOS alert and the gate summary in front of the guard', () => {
    setOverview();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Gate desk' })).toBeDefined();
    expect(screen.getByText('1 active alert')).toBeDefined();
    expect(screen.getAllByText('Ada Okafor').length).toBeGreaterThan(0);
    expect(screen.getByText('Intruder at the back gate')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getAllByText('Expected today').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chinedu Okafor').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open SOS queue' })).toBeDefined();
    expect(screen.getByRole('button', { name: /verify a code/i })).toBeDefined();
  });

  it('shows a calm state when there are no active SOS alerts', () => {
    setOverview({ activeSos: 0, activeSosEvents: [] });
    renderPage();

    expect(screen.getByText('No active SOS alerts.')).toBeDefined();
  });

  it('shows empty states for a clear gate', () => {
    setOverview({ expectedToday: [], recentVerifications: [] });
    renderPage();

    expect(screen.getByText('No visitors expected today')).toBeDefined();
    expect(screen.getByText('No verifications yet today')).toBeDefined();
  });

  it('hides sections the role cannot read instead of showing zeros', () => {
    setOverview({
      activeSos: null,
      activeSosEvents: null,
      expectedToday: null,
      verificationsToday: null,
      recentVerifications: null,
    });
    renderPage();

    expect(screen.getByText('Your role cannot read SOS alerts.')).toBeDefined();
    expect(screen.getByText('Your role cannot read access codes.')).toBeDefined();
    expect(screen.getByText('Your role cannot read verification history.')).toBeDefined();
  });

  it('renders a skeleton while the aggregate loads', () => {
    setOverview(null, true);
    renderPage();

    // No empty/denied copy can flash before data arrives.
    expect(screen.queryByText('No visitors expected today')).toBeNull();
    expect(screen.queryByText('Your role cannot read access codes.')).toBeNull();
  });
});
