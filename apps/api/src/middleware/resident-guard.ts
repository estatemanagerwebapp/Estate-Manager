import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  getAuth,
  requireAuth,
  type AuthenticatedContext,
  type VerifiedSession,
} from './auth-guard.js';

/**
 * Self-scoped resident guard for `/resident/*` routes.
 *
 * Resolves the acting resident's user id from the session (never a path
 * param) and attaches it to the request so downstream handlers can only
 * read or write that user's data. Run after `requireAuth`.
 *
 * A non-RESIDENT role is allowed through *only* if the caller has
 * `resident.manage` (the estate office acting on a resident's behalf via
 * admin flows); the resident portal routes themselves gate on the
 * permission catalogue instead of the role. This guard's job is to pin
 * "whose data" to the session user, not to do RBAC.
 */

export interface ResidentContext {
  /** The acting user's id — the scope for every self-scoped query. */
  userId: string;
  organizationId: string;
  role: string;
  sessionId: string;
}

export function getResidentContext(req: Request): ResidentContext | undefined {
  const auth: AuthenticatedContext | undefined = getAuth(req);
  if (!auth) return undefined;
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    role: auth.role,
    sessionId: auth.sessionId,
  };
}

/**
 * Express middleware that pins the acting user id onto the request and
 * rejects unauthenticated calls. Chain it after `requireAuth(verify)`:
 *
 *   const authGuard = requireAuth(verifySession);
 *   const residentGuard = requireResident();
 *   router.get('/profile', authGuard, residentGuard, handler)
 */
export function requireResident() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = getAuth(req);
    if (!auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    next();
  };
}

/**
 * Convenience: a single middleware that runs `requireAuth` then
 * `requireResident`, so resident routes only need one guard in the chain.
 */
export function requireResidentAuth(
  verifySession: (sessionId: string) => Promise<VerifiedSession | null>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(verifySession)(req, res, () => {
      requireResident()(req, res, next);
    });
  };
}
