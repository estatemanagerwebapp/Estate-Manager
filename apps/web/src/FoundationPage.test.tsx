/**
 * Smoke test for the Silverstone public landing page: it mounts without an API,
 * presents the six-section structure, and keeps both sign-in paths intact.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FoundationPage } from './pages/FoundationPage';

describe('FoundationPage', () => {
  it('renders the Silverstone landing page and auth paths', () => {
    // The landing page makes no network calls; stub fetch defensively.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );

    const { unmount } = render(
      <MemoryRouter>
        <FoundationPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Silverstone Managers home' })).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: /Better managed\.Better for life\./i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Who we work with/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Details in confidence/i })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /Built for the way you live and work/i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Ready when you are/i })).toBeTruthy();

    const onboardLinks = screen.getAllByRole('link', { name: /onboard/i });
    expect(onboardLinks.length).toBeGreaterThan(0);
    for (const link of onboardLinks) {
      expect(link.getAttribute('href')).toBe('/onboard');
    }

    const signInLinks = screen.getAllByRole('link', { name: /^sign in$/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link.getAttribute('href')).toBe('/login');
    }

    expect(screen.getByRole('link', { name: /Operator sign in/i }).getAttribute('href')).toBe(
      '/login',
    );

    const residentLinks = screen.getAllByRole('link', { name: /resident/i });
    expect(residentLinks.length).toBeGreaterThan(0);
    for (const link of residentLinks) {
      expect(link.getAttribute('href')).toBe('/resident/login');
    }

    unmount();
  });
});
