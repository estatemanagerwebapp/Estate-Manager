/**
 * Minimal web-side smoke test: asserts the foundation page mounts and the
 * system status card renders without an API (degraded state is fine).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FoundationPage } from './pages/FoundationPage';

describe('FoundationPage', () => {
  it('renders the phase-0 landing content', () => {
    // Suppress interval-based polling noise in the test environment.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );

    const { unmount } = render(<FoundationPage />);
    expect(screen.getByRole('heading', { name: /Silverstone Managers/i })).toBeTruthy();
    expect(screen.getByText(/System status/i)).toBeTruthy();
    expect(screen.getByText(/Money contract/i)).toBeTruthy();
    unmount();
  });
});
