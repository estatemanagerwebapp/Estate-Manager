import { getEnv } from '../config/env.js';
import { SESSION_COOKIE_NAME } from '../middleware/auth-guard.js';

export { SESSION_COOKIE_NAME };

/**
 * Cookie options for the session cookie. `Secure` is applied in production
 * (HTTPS); in development the browser will not accept a `Secure` cookie over
 * plain HTTP on localhost, so the flag follows `NODE_ENV`.
 *
 * `SameSite=Lax` gives us a CSRF posture without a separate CSRF token: the
 * cookie is not sent on cross-origin POSTs (all our state-changing routes are
 * POSTs issued by same-site requests), which blocks the classic cross-site
 * request forgery attack vector for cookie-authenticated browsers.
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge?: number;
} {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function clearSessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  const options = sessionCookieOptions();
  return {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  };
}
