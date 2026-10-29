import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrgImportBatchDto, OrgImportDetailResponse } from '@silverstone/shared';
import { api } from '../../api/client';
import { ToastProvider } from '../../toast/Toast';
import { OrgImportsPage } from './OrgImportsPage';

vi.mock('../../auth/useCan', () => ({
  useCan: () => ({ 'import.manage': true, user: null }),
}));

function batch(overrides: Partial<OrgImportBatchDto> = {}): OrgImportBatchDto {
  const counts = {
    total: 2,
    valid: 1,
    error: 0,
    duplicateInFile: 0,
    collision: 1,
    created: 0,
    failed: 0,
    sheets: {
      Estates: {
        total: 1,
        valid: 1,
        error: 0,
        duplicateInFile: 0,
        collision: 0,
        created: 0,
      },
      Properties: {
        total: 0,
        valid: 0,
        error: 0,
        duplicateInFile: 0,
        collision: 0,
        created: 0,
      },
      Facilities: {
        total: 0,
        valid: 0,
        error: 0,
        duplicateInFile: 0,
        collision: 0,
        created: 0,
      },
      Residents: {
        total: 1,
        valid: 0,
        error: 0,
        duplicateInFile: 0,
        collision: 1,
        created: 0,
      },
      Billing: {
        total: 0,
        valid: 0,
        error: 0,
        duplicateInFile: 0,
        collision: 0,
        created: 0,
      },
    },
  };
  return {
    id: '00000000-0000-4000-8000-000000000001',
    filename: 'onboarding.xlsx',
    fingerprint: 'f'.repeat(64),
    status: 'PREVIEWED',
    counts,
    uploadedById: '00000000-0000-4000-8000-000000000002',
    uploadedAt: '2026-10-29T10:00:00.000Z',
    committedAt: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <OrgImportsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OrgImportsPage', () => {
  it('shows the empty state when the organization has no batches', async () => {
    vi.spyOn(api, 'listOrgImportBatches').mockResolvedValue({ batches: [], total: 0 });

    renderPage();

    expect(await screen.findByText('No workbooks uploaded')).toBeTruthy();
    expect(screen.getAllByText('Data import').length).toBeGreaterThan(0);
  });

  it('opens a batch and shows row-level collisions before commit', async () => {
    const previewed = batch();
    vi.spyOn(api, 'listOrgImportBatches').mockResolvedValue({
      batches: [previewed],
      total: 1,
    });
    const detail: OrgImportDetailResponse = {
      batch: previewed,
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          batchId: previewed.id,
          sheet: 'Estates',
          rowNumber: 2,
          status: 'VALID',
          errors: [],
          reference: 'new-estate',
          entityType: null,
          entityId: null,
        },
        {
          id: '00000000-0000-4000-8000-000000000011',
          batchId: previewed.id,
          sheet: 'Residents',
          rowNumber: 2,
          status: 'COLLISION',
          errors: ['A user or onboarding draft with email "ada@example.com" already exists.'],
          reference: 'ada@example.com',
          entityType: null,
          entityId: null,
        },
      ],
    };
    vi.spyOn(api, 'getOrgImportBatch').mockResolvedValue(detail);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    expect(
      await screen.findByText(
        'A user or onboarding draft with email "ada@example.com" already exists.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit batch' })).toBeTruthy();
  });
});
