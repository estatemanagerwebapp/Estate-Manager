import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { getAuth, requireAuth } from '../../middleware/auth-guard.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import { loadSyncSnapshot, type SyncServiceOptions } from './sync.service.js';

export interface SyncRouteOptions extends SyncServiceOptions {
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
}

/**
 * How far back a client may resume. A tab left open overnight should not turn
 * the first poll into a full-window scan; counts are always current, and the
 * client refreshes the changed domains regardless of how long it was away.
 */
export const SYNC_MAX_LOOKBACK_MS = 10 * 60 * 1000;

/** Parse the opaque ISO cursor; anything unparseable is a client error. */
export function parseSyncCursor(raw: unknown, now: Date): Date {
  if (raw === undefined || raw === null || raw === '') return now;
  if (typeof raw !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sync cursor');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid sync cursor');
  }
  const earliest = new Date(now.getTime() - SYNC_MAX_LOOKBACK_MS);
  if (parsed < earliest) return earliest;
  // A cursor ahead of the server clock cannot be trusted; start from now.
  return parsed > now ? now : parsed;
}

/**
 * Live sync, mounted at `/sync`.
 *
 * One request returns the signed-in role's badge counts and the domains that
 * changed since the caller's cursor. The shell polls it (5s visible, 30s
 * hidden) and invalidates only those domains, so open lists update without a
 * manual refresh. It is a read-only projection: no writes, no side effects.
 */
export function createSyncRouter(options: SyncRouteOptions): Router {
  const router = Router();
  const { sessions, permissions, organizationId } = options;
  const authGuard = requireAuth((sessionId) => sessions.verify(sessionId));

  router.get('/', authGuard, async (req, res, next) => {
    const auth = getAuth(req);
    if (!auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    const now = new Date();
    let since: Date;
    try {
      since = parseSyncCursor(req.query.since, now);
    } catch (error) {
      next(error);
      return;
    }

    const held = new Set<string>(await permissions.effectivePermissions(auth.role));
    const snapshot = await loadSyncSnapshot(
      {
        organizationId,
        userId: auth.userId,
        role: auth.role,
        held,
        since,
      },
      options,
    );

    res.status(200).json({ data: snapshot });
  });

  return router;
}
