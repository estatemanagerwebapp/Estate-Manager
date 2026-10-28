import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import rateLimit from 'express-rate-limit';
import {
  requireAuth,
  requirePermission,
  getAuth,
  auditContext,
  SESSION_COOKIE_NAME,
} from '../../middleware/auth-guard.js';
import { z } from 'zod';
import { STAFF_ROLE_KEYS } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { createRateLimitedResponse } from '../../lib/rate-limit-response.js';
import { clearSessionCookieOptions, sessionCookieOptions } from '../../lib/session-cookie.js';
import type { AuthService, AuthAuditContext } from '../auth/auth.service.js';
import type { UserService } from '../auth/user.service.js';
import type { PrismaSessionRepository } from '../auth/session-repository.js';
import type { PermissionResolver } from '../auth/permission-resolver.js';
import { USER_MANAGE } from '../auth/user-rules.js';

export interface AuthRouteOptions {
  authService: AuthService;
  userService: UserService;
  sessions: PrismaSessionRepository;
  permissions: PermissionResolver;
  organizationId: string;
  /**
   * Per-endpoint limiter caps (login / forgot-password / reset-password).
   * Defaults to the production values; tests raise them so a full suite
   * never trips the limiter.
   */
  rateLimits?: {
    loginPerWindow?: number;
    forgotPerWindow?: number;
    resetPerWindow?: number;
  };
}

export function createAuthRouter(options: AuthRouteOptions): Router {
  const router = Router();
  const { authService, userService, sessions, permissions, organizationId } = options;

  const verifySession = (sessionId: string) => sessions.verify(sessionId);
  const authGuard = requireAuth(verifySession);

  function makeContext(req: Request, res: Response): AuthAuditContext {
    const ctx = auditContext(req, res);
    return {
      organizationId: ctx.organizationId ?? organizationId,
      actorId: ctx.actorId,
      requestId: ctx.requestId ?? null,
    };
  }

  // --- Per-endpoint rate limiters ---------------------------------------------

  const authLimiter = (limit: number, windowMs: number) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      handler: (_req, res) => {
        createRateLimitedResponse(res);
      },
    });

  const loginLimiter = authLimiter(options.rateLimits?.loginPerWindow ?? 10, 15 * 60 * 1000);
  const forgotPasswordLimiter = authLimiter(
    options.rateLimits?.forgotPerWindow ?? 5,
    15 * 60 * 1000,
  );
  const resetPasswordLimiter = authLimiter(options.rateLimits?.resetPerWindow ?? 5, 60 * 60 * 1000);

  // --- POST /auth/login ---------------------------------------------------------

  router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          email: z.string().trim().min(1).max(255),
          password: z.string().min(1).max(512),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid login input'));
        return;
      }

      const context = makeContext(req, res);
      const { user, sessionToken } = await authService.login(
        organizationId,
        body.data.email,
        body.data.password,
        context,
      );

      // HttpOnly cookie: never readable from JS; Secure in production;
      // SameSite=Lax blocks cross-site POSTs (CSRF posture without a
      // separate CSRF token, documented in session-cookie.ts).
      res.cookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());

      res.status(200).json({ data: { user } });
    } catch (error) {
      next(error);
    }
  });

  // --- POST /auth/logout --------------------------------------------------------

  router.post('/logout', authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = makeContext(req, res);
      const sessionId = getAuth(req)?.sessionId ?? '';
      await authService.logout(context, sessionId);
      res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
      res.status(200).json({ data: { ok: true } });
    } catch (error) {
      next(error);
    }
  });

  // --- GET /auth/me -------------------------------------------------------------

  router.get('/me', authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = makeContext(req, res);
      const response = await authService.me(context);
      res.status(200).json({ data: response });
    } catch (error) {
      next(error);
    }
  });

  // --- POST /auth/change-password -------------------------------------------------

  router.post(
    '/change-password',
    authGuard,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = z
          .object({
            currentPassword: z.string().min(1).max(512),
            newPassword: z.string().min(8).max(512),
          })
          .safeParse(req.body ?? {});
        if (!body.success) {
          next(new AppError(400, 'VALIDATION_ERROR', 'Invalid change-password input'));
          return;
        }
        const context = makeContext(req, res);
        const response = await authService.changePassword(
          context,
          body.data.currentPassword,
          body.data.newPassword,
        );
        res.status(200).json({ data: response });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- POST /auth/forgot-password ---------------------------------------------------

  router.post(
    '/forgot-password',
    forgotPasswordLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = z
          .object({
            email: z.string().trim().min(1).max(255),
          })
          .safeParse(req.body ?? {});
        if (!body.success) {
          next(new AppError(400, 'VALIDATION_ERROR', 'Invalid email'));
          return;
        }
        const context = makeContext(req, res);
        await authService.forgotPassword(organizationId, body.data.email, context);
        // Always 200 — never reveal whether the address is known.
        res.status(200).json({ data: { ok: true } });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- POST /auth/reset-password -----------------------------------------------------

  router.post(
    '/reset-password',
    resetPasswordLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = z
          .object({
            token: z.string().trim().min(32).max(256),
            newPassword: z.string().min(8).max(512),
          })
          .safeParse(req.body ?? {});
        if (!body.success) {
          next(new AppError(400, 'VALIDATION_ERROR', 'Invalid reset-password input'));
          return;
        }
        const context = makeContext(req, res);
        const response = await authService.resetPassword(
          organizationId,
          body.data.token,
          body.data.newPassword,
          context,
        );
        res.status(200).json({ data: response });
      } catch (error) {
        next(error);
      }
    },
  );

  // --- Admin user management (all require `user.manage`) ---------------------------
  // Every user route is chained through `requireAuth` (cookie session) and
  // `requirePermission` (role → permission, via the shared catalogue).

  /** Extract a string param value, rejecting array-valued (repeated) params. */
  function param(req: Request, name: string): string {
    const value = req.params[name];
    const flat = Array.isArray(value) ? value[0] : value;
    if (typeof flat !== 'string' || flat.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Missing :${name} parameter`);
    }
    return flat;
  }

  // Both guards are standard Express middlewares; chain them so errors
  // (401 / 403) reach the central error handler exactly once.
  const userManagePermission = requirePermission((ctx) => permissions.can(ctx.role, USER_MANAGE));

  // Wrap async handlers so rejections flow through `next(error)`.
  const asyncWrap =
    (handler: RequestHandler): RequestHandler =>
    (req, res, next) => {
      void (async () => {
        try {
          await handler(req, res, next);
        } catch (error) {
          if (!res.headersSent) next(error);
        }
      })();
    };

  router.get(
    '/users',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const query = z
        .object({
          role: z.enum(['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'RESIDENT', 'AUDITOR']).optional(),
          status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
          // `scope=staff` is the Administrators screen. The default keeps the
          // historical all-accounts behavior for existing callers.
          scope: z.enum(['all', 'staff']).optional(),
        })
        .safeParse(req.query ?? {});
      if (!query.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid filter'));
        return;
      }
      const response = await userService.list(organizationId, {
        role: query.data.role,
        status: query.data.status,
        staffOnly: query.data.scope === 'staff',
      });
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /users --------------------------------------------------------------
  // Create a staff account. Residents are intentionally not accepted here;
  // their accounts are created by the onboarding/payment flow.

  router.post(
    '/users',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          email: z.string().trim().email().max(255),
          fullName: z.string().trim().min(1).max(160),
          phone: z.string().trim().max(40).optional().nullable(),
          role: z.enum(STAFF_ROLE_KEYS),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid administrator account'));
        return;
      }

      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }

      const context = makeContext(req, res);
      const response = await userService.create(context, auth.role, body.data);
      res.status(201).json({ data: response });
    }),
  );

  router.get(
    '/users/:userId',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res) => {
      const response = await userService.get(organizationId, param(req, 'userId'));
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/users/:userId/status',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
          reason: z.string().max(280).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid status update'));
        return;
      }
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await userService.setStatus(
        context,
        auth.role,
        param(req, 'userId'),
        body.data.status,
        body.data.reason ?? '',
      );
      res.status(200).json({ data: response });
    }),
  );

  router.post(
    '/users/:userId/role',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const body = z
        .object({
          role: z.enum(['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'RESIDENT', 'AUDITOR']),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid role update'));
        return;
      }
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await userService.setRole(
        context,
        auth.role,
        param(req, 'userId'),
        body.data.role,
      );
      res.status(200).json({ data: response });
    }),
  );

  // --- POST /users/:userId/sessions/revoke -------------------------------------

  router.post(
    '/users/:userId/sessions/revoke',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await userService.revokeSessions(context, auth.role, param(req, 'userId'));
      res.status(200).json({ data: response });
    }),
  );

  // --- DELETE /users/:userId ----------------------------------------------------

  router.delete(
    '/users/:userId',
    authGuard,
    userManagePermission,
    asyncWrap(async (req, res, next) => {
      const auth = getAuth(req);
      if (!auth) {
        next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const context = makeContext(req, res);
      const response = await userService.remove(context, auth.role, param(req, 'userId'));
      res.status(200).json({ data: response });
    }),
  );

  return router;
}
