import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEventDto } from '@silverstone/shared';
import { api } from '../../api/client';
import { ToastProvider } from '../../toast/Toast';
import { ActivityPage, buildActivityFilter } from './ActivityPage';

function event(overrides: Partial<AuditEventDto> = {}): AuditEventDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    eventType: 'estate.created',
    actorId: '00000000-0000-4000-8000-000000000002',
    actorEmail: 'admin@example.com',
    actorName: 'Admin',
    targetType: 'estate',
    targetId: '00000000-0000-4000-8000-000000000003',
    requestId: 'req-1',
    outcome: 'success',
    metadata: { targetName: 'Silverstone Gate A' },
    createdAt: '2026-10-29T10:00:00.000Z',
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
          <ActivityPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('activity filter helpers', () => {
  it('omits empty filters', () => {
    expect(
      buildActivityFilter({
        eventType: '',
        outcome: '',
        targetType: '',
        from: '',
        to: '',
        estateId: '',
      }),
    ).toEqual({});
  });

  it('maps selects and date inputs onto the API contract', () => {
    expect(
      buildActivityFilter({
        eventType: 'estate.created',
        outcome: 'failure',
        targetType: 'estate',
        from: '2026-10-01',
        to: '2026-10-31',
        estateId: '',
      }),
    ).toEqual({
      eventType: 'estate.created',
      outcome: 'failure',
      targetType: 'estate',
      from: new Date('2026-10-01T00:00:00').toISOString(),
      to: new Date('2026-10-31T23:59:59.999').toISOString(),
    });
  });
});

describe('ActivityPage', () => {
  it('reloads the cursor chain when a filter changes', async () => {
    const getEvents = vi.spyOn(api, 'getAuditEvents').mockResolvedValue({
      events: [event()],
      nextCursor: null,
      limit: 25,
    });

    renderPage();
    await screen.findByRole('cell', { name: /estate\.created/ }, { timeout: 5000 });

    fireEvent.change(screen.getByLabelText('Filter by outcome'), {
      target: { value: 'failure' },
    });

    await waitFor(() => {
      expect(getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: 'failure', limit: 25 }),
      );
    });
  });

  it('appends the next page after the first page cursor', async () => {
    const getEvents = vi
      .spyOn(api, 'getAuditEvents')
      .mockResolvedValueOnce({
        events: [event()],
        nextCursor: 'cursor-2',
        limit: 25,
      })
      .mockResolvedValueOnce({
        events: [event({ id: 'event-2', eventType: 'property.created' })],
        nextCursor: null,
        limit: 25,
      });

    renderPage();
    await screen.findByRole('cell', { name: /estate\.created/ }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /Load more/i }));

    await screen.findByRole('cell', { name: /property\.created/ }, { timeout: 5000 });
    expect(getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'cursor-2' }));
  });

  it('opens a detail drawer with the request id and metadata', async () => {
    vi.spyOn(api, 'getAuditEvents').mockResolvedValue({
      events: [event()],
      nextCursor: null,
      limit: 25,
    });

    renderPage();
    await screen.findByRole('cell', { name: /estate\.created/ }, { timeout: 5000 });

    fireEvent.click(screen.getAllByRole('button', { name: /View/i })[0]!);

    const drawer = screen.getByRole('dialog', { name: 'Audit event' });
    expect(drawer.textContent).toContain('req-1');
    expect(drawer.textContent).toContain('Silverstone Gate A');
  });

  it('exports the current filtered view and confirms with a toast', async () => {
    const createObjectURL = vi.fn(() => 'blob:audit');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(api, 'getAuditEvents').mockResolvedValue({
      events: [event()],
      nextCursor: null,
      limit: 25,
    });
    const exportEvents = vi.spyOn(api, 'exportAuditEvents').mockResolvedValue({
      blob: new Blob(['id\n']),
      filename: 'audit-log-2026-10-29.csv',
    });

    renderPage();
    await screen.findByRole('cell', { name: /estate\.created/ }, { timeout: 5000 });

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

    await waitFor(() => expect(exportEvents).toHaveBeenCalledWith({}));
    expect(await screen.findByText(/Exported audit-log-2026-10-29\.csv/)).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
  });
});
