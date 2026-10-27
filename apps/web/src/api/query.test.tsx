/**
 * Cache behaviour contract for the console.
 *
 * Reads are cached for the life of the session; remounting a screen must not
 * re-hit the API, and the header Refresh control is the explicit way to
 * re-pull the active queries. These tests pin both halves of that behaviour
 * so a future change to the QueryClient defaults cannot silently reintroduce
 * a fetch-on-every-navigation regression.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient, useApiQuery } from './query';
import { RefreshButton } from '../components/RefreshButton';

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

function Screen({ fetcher }: { fetcher: () => Promise<{ value: number }> }) {
  const { data, loading } = useApiQuery(['cache-test'], fetcher, 'Could not load.');
  return <p>{loading ? 'Loading' : `Value ${data?.value}`}</p>;
}

function Host({ fetcher }: { fetcher: () => Promise<{ value: number }> }) {
  const [visible, setVisible] = useState(true);
  return (
    <QueryClientProvider client={queryClient}>
      <button type="button" onClick={() => setVisible((current) => !current)}>
        Toggle screen
      </button>
      {visible && <Screen fetcher={fetcher} />}
      <RefreshButton />
    </QueryClientProvider>
  );
}

describe('query cache', () => {
  it('keeps an infinite stale time and a one-hour garbage-collection window', () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(defaults?.gcTime).toBe(60 * 60 * 1000);
  });

  it('paints from cache on remount and only re-reads when Refresh is pressed', async () => {
    const fetcher = vi.fn(async () => ({ value: fetcher.mock.calls.length }));

    render(<Host fetcher={fetcher} />);

    await waitFor(() => expect(screen.getByText('Value 1')).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Unmount + remount the screen. The query is still fresh, so no request.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle screen' }));
    await waitFor(() => expect(screen.getByText('Value 1')).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(1);

    // The explicit control invalidates the active query and re-reads it.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh data' }));
    await waitFor(() => expect(screen.getByText('Value 2')).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
