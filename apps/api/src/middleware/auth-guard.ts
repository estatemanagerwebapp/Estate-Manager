import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

export interface AuthenticatedContext {
  organizationId: string;
  userId: string;
  /** The user's stored role, read from the database during session
   *  verification — never taken from the request. */
  role: string;
  sessionId: string;
}

type AuthenticatedRequest = Request & {
  auth?: AuthenticatedContext;
};

export const SESSION_COOKIE_NAME = 'silverstone.session';

export function readSessionId(req: Request): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const segments = raw.split(';');
  for (const segment of segments) {
    const [key, ...rest] = segment.trim().split('=');
    if (key === SESSION_COOKIE_NAME) {
      const value = rest.join('=').trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

export interface VerifiedSession {
  user: { id: string; organizationId: string; status: string; role: string };
  session: { expiresAt: Date | null };
}

/**
 * Authentication guard, run before any protected route.
 *
 * Verifies the `silverstone.session` cookie (an opaque session id) against the
 * session verifier: the session must exist, not be revoked (non-null
 * `expiresAt`), not be expired, and its user must have status `ACTIVE`.
 * Suspended / disabled accounts are rejected here so they cannot use any
 * authenticated endpoint while in that state.
 *
 * Any failure → 401 `UNAUTHORIZED` with a single generic message, so no
 * response reveals which check failed (unknown id vs revoked vs expired vs
 * suspended account).
 */
export function requireAuth(verifySession: (sessionId: string) => Promise<VerifiedSession | null>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authedReq = req as AuthenticatedRequest;
    const sessionId = readSessionId(req);

    if (!sessionId) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    void (async () => {
      let verified: VerifiedSession | null;
      try {
        verified = await verifySession(sessionId);
      } catch {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }

      if (
        verified === null ||
        verified.session.expiresAt === null ||
        verified.session.expiresAt.getTime() <= Date.now() ||
        verified.user.status !== 'ACTIVE'
      ) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }

      authedReq.auth = {
        organizationId: verified.user.organizationId,
        userId: verified.user.id,
        role: verified.user.role,
        sessionId,
      };
      next();
    })();
  };
}

export function getAuth(req: Request): AuthenticatedContext | undefined {
  return (req as AuthenticatedRequest).auth;
}

/**
 * RBAC guard. Must run after `requireAuth`. The decision is always derived
 * from server-side data (the authenticated user's stored role + the
 * organization's grants); nothing supplied by the client is ever trusted.
 *
 * Missing permission → 403 `FORBIDDEN`.
 */
export function requirePermission(
  checkPermission: (context: AuthenticatedContext) => Promise<boolean>,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = getAuth(req);
    if (!auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    void (async () => {
      try {
        const allowed = await checkPermission(auth);
        if (!allowed) {
          next(new AppError(403, 'FORBIDDEN', 'Insufficient permission'));
          return;
        }
        next();
      } catch {
        next(new AppError(403, 'FORBIDDEN', 'Insufficient permission'));
      }
    })();
  };
}

/** Safe, redacted audit context pulled from the request/response. */
export function auditContext(req: Request, res: Response) {
  const authedReq = req as AuthenticatedRequest;
  const rawRequestId = res.getHeader('x-request-id');
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
  return {
    actorId: authedReq.auth?.userId ?? null,
    organizationId: authedReq.auth?.organizationId,
    role: authedReq.auth?.role,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    sessionId: authedReq.auth?.sessionId,
  };
}
