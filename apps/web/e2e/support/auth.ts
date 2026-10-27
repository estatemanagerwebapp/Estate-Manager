import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_USERS } from './environment';

/**
 * Fixture accounts available to the browser suite.
 *
 * `admin` is a SUPER_ADMIN (every capability); `auditor` is read-only. The
 * browser suite signs in through the real login form — there is no test-only
 * authentication hook — so these are ordinary accounts in the disposable
 * test database.
 */
export type E2eUser = keyof typeof E2E_USERS;

/**
 * Sign in through the real login form and wait until the console confirms the
 * session is active.
 */
export async function loginAs(page: Page, user: E2eUser): Promise<void> {
  const credentials = E2E_USERS[user];

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // The overview heading is the unambiguous "a session is active" signal — the
  // toast that also names the account is transient.
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(page.getByText(`Signed in as ${credentials.email} ·`)).toBeVisible();
}

/** The toast surface rendered at the app root. */
export function notifications(page: Page) {
  return page.getByRole('region', { name: 'Notifications' });
}

/**
 * Create an estate through the API. Used by scenarios that need an estate to
 * exist but are not testing estate management itself (so they do not depend on
 * another scenario having run first).
 */
export async function createEstateViaApi(
  request: APIRequestContext,
  input: { name: string; slug: string; address?: string },
): Promise<string> {
  const response = await request.post('/api/v1/estates', {
    data: {
      name: input.name,
      slug: input.slug,
      ...(input.address ? { address: input.address } : {}),
    },
  });
  if (!response.ok()) {
    throw new Error(`Could not create estate "${input.name}" (HTTP ${response.status()}).`);
  }
  const body = (await response.json()) as { data?: { estate?: { id?: string } } };
  const id = body.data?.estate?.id;
  if (!id) {
    throw new Error(`The estate creation response did not contain an estate id.`);
  }
  return id;
}

/** Sign the API request context in as the fixture administrator. */
export async function loginApiAsAdmin(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/v1/auth/login', {
    data: { email: E2E_USERS.admin.email, password: E2E_USERS.admin.password },
  });
  if (!response.ok()) {
    throw new Error(`The fixture administrator could not sign in (HTTP ${response.status()}).`);
  }
}
