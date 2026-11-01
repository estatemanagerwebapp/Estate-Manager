import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { withDatabaseSecurityContext } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuthenticatedContext {
  organizationId: string;
  userId: string;
  /** The user's stored role, read from the database during session
   *  verification — never taken from the request. */
  role: string;
  sessionId: string;
  /** Authenticated members of this resident household, resolved server-side. */
  residentAccountUserIds?: readonly string[];
  /** Estate IDs loaded from staff assignments during server-side session verification. */
  estateIds: readonly string[];
  /** Resident property IDs are loaded from the verified account relationship. */
  propertyIds: readonly string[];
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
  user: {
    id: string;
    organizationId: string;
    status: string;
    role: string;
    estateIds?: string[];
    propertyIds?: string[];
  };
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
  return (req: Request, res: Response, next: NextFunction): void => {
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
        residentAccountUserIds: [verified.user.id],
        estateIds: verified.user.estateIds ?? [],
        propertyIds: verified.user.propertyIds ?? [],
      };
      withRequestDatabaseScope(
        {
          organizationId: verified.user.organizationId,
          userId: verified.user.id,
          role: verified.user.role,
          residentAccountUserIds: [],
          estateIds: verified.user.estateIds ?? [],
          propertyIds: verified.user.propertyIds ?? [],
        },
        res,
        next,
        (resolvedContext) => {
          authedReq.auth!.estateIds = resolvedContext.estateIds;
          authedReq.auth!.propertyIds = resolvedContext.propertyIds;
          authedReq.auth!.residentAccountUserIds = resolvedContext.residentAccountUserIds ?? [verified.user.id];
        },
      );
    })();
  };
}

/** Bind the full request lifecycle to one database transaction with RLS context. */
export function withRequestDatabaseScope(
  context: import('../lib/prisma.js').DatabaseSecurityContext,
  res: Response,
  next: NextFunction,
  onResolved?: (context: import('../lib/prisma.js').DatabaseSecurityContext) => void,
): void {
  // Unit tests use fake services and do not connect to PostgreSQL. Production
  // and local development always use the transaction-backed RLS path.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  let settled = false;
  const responseFinished = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      if (res.statusCode >= 500) reject(new Error(`Request failed with HTTP ${res.statusCode}`));
      else resolve();
    };
    res.once('finish', finish);
    res.once('close', finish);
  });

  void withDatabaseSecurityContext(context, async (_transaction, resolvedContext) => {
    onResolved?.(resolvedContext);
    // Express continues dispatch synchronously; async route handlers inherit
    // the transaction's AsyncLocalStorage context.
    next();
    await responseFinished;
  }).catch((error: unknown) => {
    if (res.headersSent) {
      logger.error({ err: error }, 'Database request transaction rolled back after response');
      return;
    }
    next(
      new AppError(503, 'DATABASE_UNAVAILABLE', 'Could not establish an isolated database request'),
    );
  });
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

/** Audit context with the route's configured organization as a fallback. */
export function routeAuditContext(
  req: Request,
  res: Response,
  fallbackOrganizationId: string,
): { organizationId: string; actorId: string | null; requestId: string | null } {
  const context = auditContext(req, res);
  return {
    organizationId: context.organizationId ?? fallbackOrganizationId,
    actorId: context.actorId,
    requestId: context.requestId ?? null,
  };
}

/** Read a required, non-array route parameter. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  const flat = Array.isArray(value) ? value[0] : value;
  if (typeof flat !== 'string' || flat.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `Missing :${name} parameter`);
  }
  return flat;
}
