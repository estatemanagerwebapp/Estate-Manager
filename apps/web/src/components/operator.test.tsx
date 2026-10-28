import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, DetailDrawer, FilterBar, OperatorPageHeader, StatusBadge } from './operator';

afterEach(cleanup);

describe('operator UI primitives', () => {
  it('renders a page header with actions and description', () => {
    render(
      <OperatorPageHeader
        icon={<span>ICON</span>}
        title="Residents"
        description="Manage the resident register."
        actions={<button type="button">Add resident</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Residents' })).toBeTruthy();
    expect(screen.getByText('Manage the resident register.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add resident' })).toBeTruthy();
  });

  it('renders typed table rows and an empty state', () => {
    const columns = [
      { key: 'name', header: 'Name', cell: (row: { id: string; name: string }) => row.name },
      {
        key: 'status',
        header: 'Status',
        cell: () => <StatusBadge status="ACTIVE" />,
      },
    ];

    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={[{ id: 'r1', name: 'Ada' }]}
        getRowKey={(row) => row.id}
        caption="Residents"
      />,
    );

    expect(screen.getByRole('cell', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();

    rerender(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyTitle="No residents"
        emptyBody="Register a resident to get started."
      />,
    );

    expect(screen.getByText('No residents')).toBeTruthy();
    expect(screen.getByText('Register a resident to get started.')).toBeTruthy();
  });

  it('renders a filter bar and an error state', () => {
    const { rerender } = render(
      <FilterBar summary="3 results" actions={<button type="button">Refresh</button>}>
        <input aria-label="Search" />
      </FilterBar>,
    );

    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByLabelText('Search')).toBeTruthy();
    expect(screen.getByText('3 results')).toBeTruthy();

    rerender(
      <DataTable
        columns={[{ key: 'name', header: 'Name', cell: () => 'Ada' }]}
        rows={[]}
        getRowKey={() => 'r1'}
        error="Could not load residents."
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Could not load residents.');
  });

  it('closes the detail drawer on Escape and overlay click', async () => {
    const onClose = vi.fn();
    render(
      <DetailDrawer open onClose={onClose} title="Resident detail">
        <p>Body</p>
      </DetailDrawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Resident detail' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const closeButtons = screen.getAllByRole('button', { name: 'Close detail panel' });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
