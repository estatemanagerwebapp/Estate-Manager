import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { applyServerlessDatabaseSettings, getEnv, normalizeDatabaseUrl } from '../config/env.js';

let client: PrismaClient | undefined;
let rawClient: PrismaClient | undefined;

export interface DatabaseSecurityContext {
  organizationId: string;
  userId: string;
  role: string;
  residentAccountUserIds?: readonly string[];
  estateIds: readonly string[];
  propertyIds: readonly string[];
  onboardingCodeHash?: string;
}

type ScopedTransaction = { tx: Prisma.TransactionClient; context: DatabaseSecurityContext };
const scopedTransaction = new AsyncLocalStorage<ScopedTransaction>();

/**
 * The database sits behind a session-mode pooler that accepts only 15 client
 * connections in total (`max clients reached in session mode ... pool_size:
 * 15`). A test run opens one Prisma client per worker, so the pool is
 * narrowed for tests: three connections per client with a generous wait.
 * That keeps two workers (six connections) comfortably inside the budget,
 * even while a development server holds its own connections against the
 * same database. Serverless runtimes switch Supabase pooler URLs to
 * transaction mode in `applyServerlessDatabaseSettings`.
 */
function testDatabaseUrl(): string | undefined {
  if (process.env.VITEST !== 'true') return undefined;
  // Tests seed and inspect protected tables directly, so they keep using the
  // schema owner (DIRECT_URL). Only the API runtime uses the RLS role.
  const url =
    process.env.SILVERSTONE_TEST_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL;
  if (!url) return undefined;
  const separator = url.indexOf('?');
  const base = separator === -1 ? url : url.slice(0, separator);
  const query = separator === -1 ? '' : url.slice(separator + 1);
  const params = new URLSearchParams(query);
  params.set('connection_limit', '3');
  params.set('pool_timeout', '30');
  return `${base}?${params.toString()}`;
}

/**
 * Prisma validates the raw `process.env.DATABASE_URL` itself, so it never sees
 * the quoting/whitespace normalisation applied by `parseEnv`. Pass the
 * validated URL explicitly to keep both consumers on the same value.
 */
function databaseUrl(): string {
  const url = testDatabaseUrl() ?? getEnv().DATABASE_URL;
  return applyServerlessDatabaseSettings(normalizeDatabaseUrl(url));
}

export function getPrismaClient(): PrismaClient {
  if (client) return client;
  rawClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: databaseUrl() } },
  });
  // Every repository is constructed with this client. While an authenticated
  // request transaction is active, all model/raw queries are routed through
  // its transaction client so PostgreSQL's SET LOCAL values cannot be lost to
  // the pooler or a different connection.
  client = new Proxy(rawClient, {
    get(target, property) {
      const scope = scopedTransaction.getStore();
      if (scope) {
        if (property === '$transaction') {
          return async (operation: unknown) => {
            if (typeof operation === 'function') return operation(scope.tx);
            if (Array.isArray(operation)) return Promise.all(operation);
            throw new Error('Unsupported nested transaction operation');
          };
        }
        const txValue = Reflect.get(scope.tx as object, property, scope.tx);
        if (txValue !== undefined)
          return typeof txValue === 'function' ? txValue.bind(scope.tx) : txValue;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return client;
}

/** Run an authenticated HTTP request on one transaction-bound DB connection. */
export async function withDatabaseSecurityContext<T>(
  context: DatabaseSecurityContext,
  operation: (
    transaction: Prisma.TransactionClient,
    resolvedContext: DatabaseSecurityContext,
  ) => Promise<T>,
): Promise<T> {
  if (!rawClient) getPrismaClient();
  const database = rawClient!;
  return database.$transaction(
    async (tx) => {
      await assertRlsTransactionReady(tx);
      await tx.$queryRaw`SELECT
      set_config('app.organization_id', ${context.organizationId}, true),
      set_config('app.user_id', ${context.userId}, true),
      set_config('app.user_role', ${context.role}, true),
      set_config('app.onboarding_code_hash', ${context.onboardingCodeHash ?? ''}, true),
      set_config('app.resident_account_user_ids', '', true),
      set_config('app.estate_ids', '', true),
      set_config('app.property_ids', '', true)`;
      // Assignments are reloaded inside the RLS transaction from the verified
      // user identity. The session lookup itself runs before request context,
      // so it deliberately does not provide authoritative estate IDs.
      const assignments: Array<{ estateId: string }> = [];
      const residentProperties: Array<{ propertyId: string }> = [];
      const guestOnboarding: Array<{ propertyId: string }> = [];
      const residentAccountUserIds = new Set<string>(context.residentAccountUserIds ?? []);
      if (context.userId) {
        const [assignmentRows, residentPropertyRows, ownedMemberships, joinedMemberships] =
          await Promise.all([
          tx.userEstateAssignment.findMany({
            where: { organizationId: context.organizationId, userId: context.userId },
            select: { estateId: true },
          }),
          tx.residentOnboarding.findMany({
            where: { organizationId: context.organizationId, userId: context.userId },
            select: { propertyId: true },
          }),
          context.role === 'RESIDENT'
            ? tx.residentAccountMember.findMany({
                where: { organizationId: context.organizationId, ownerUserId: context.userId },
                select: { memberUserId: true },
              })
            : Promise.resolve([]),
          context.role === 'RESIDENT'
            ? tx.residentAccountMember.findMany({
                where: { organizationId: context.organizationId, memberUserId: context.userId },
                select: { ownerUserId: true },
              })
            : Promise.resolve([]),
        ]);
        assignments.push(...assignmentRows);
        residentProperties.push(...residentPropertyRows);
        if (context.role === 'RESIDENT') {
          residentAccountUserIds.add(context.userId);
          for (const membership of ownedMemberships) {
            residentAccountUserIds.add(membership.memberUserId);
          }
          for (const membership of joinedMemberships) {
            residentAccountUserIds.add(membership.ownerUserId);
          }
          await tx.$queryRaw`SELECT set_config('app.resident_account_user_ids', ${[...residentAccountUserIds].join(',')}, true)`;
          const accountIds = [...residentAccountUserIds];
          const [accountMemberships, accountProperties] = await Promise.all([
            tx.residentAccountMember.findMany({
              where: {
                organizationId: context.organizationId,
                OR: [{ ownerUserId: { in: accountIds } }, { memberUserId: { in: accountIds } }],
              },
              select: { ownerUserId: true, memberUserId: true },
            }),
            tx.residentOnboarding.findMany({
              where: { organizationId: context.organizationId, userId: { in: accountIds } },
              select: { propertyId: true },
            }),
          ]);
          for (const membership of accountMemberships) {
            residentAccountUserIds.add(membership.ownerUserId);
            residentAccountUserIds.add(membership.memberUserId);
          }
          residentProperties.push(...accountProperties);
        }
      } else if (context.onboardingCodeHash) {
        guestOnboarding.push(
          ...(await tx.residentOnboarding.findMany({
            where: { organizationId: context.organizationId, codeHash: context.onboardingCodeHash },
            select: { propertyId: true },
          })),
        );
      }
      const resolvedContext: DatabaseSecurityContext = {
        ...context,
        residentAccountUserIds: [...residentAccountUserIds],
        estateIds: [...new Set([...context.estateIds, ...assignments.map((row) => row.estateId)])],
        propertyIds: [
          ...new Set([
            ...context.propertyIds,
            ...residentProperties.map((row) => row.propertyId),
            ...guestOnboarding.map((row) => row.propertyId),
          ]),
        ],
      };
      await tx.$queryRaw`SELECT
      set_config('app.estate_ids', ${[...resolvedContext.estateIds].join(',')}, true),
      set_config('app.property_ids', ${[...resolvedContext.propertyIds].join(',')}, true),
      set_config('app.resident_account_user_ids', ${(resolvedContext.residentAccountUserIds ?? []).join(',')}, true)`;
      return scopedTransaction.run({ tx, context: resolvedContext }, () =>
        operation(tx, resolvedContext),
      );
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

const RLS_PROTECTED_TABLES = [
  'estates',
  'user_estate_assignments',
  'properties',
  'resident_onboardings',
  'resident_account_members',
  'import_batches',
  'import_rows',
  'organization_import_batches',
  'organization_import_rows',
  'facilities',
  'bookings',
  'facility_availability_watches',
  'estate_broadcasts',
  'access_codes',
  'access_verifications',
  'complaints',
  'complaint_replies',
  'sos_events',
  'invoices',
  'payments',
  'transactions',
  'audit_events',
  'message_threads',
  'messages',
  'notifications',
  'announcements',
  'media_files',
] as const;

/** Fail readiness if RLS is disabled or the API is using a bypass-capable role. */
export async function assertRlsRuntimeReady(): Promise<void> {
  const database = getPrismaClient();
  const [roleRows, unprotectedRows] = await Promise.all([
    database.$queryRaw<
      Array<{ roleName: string; superuser: boolean; bypassRls: boolean; ownsProtected: boolean }>
    >`
      SELECT current_user AS "roleName", r.rolsuper AS "superuser", r.rolbypassrls AS "bypassRls",
        EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY(${[...RLS_PROTECTED_TABLES]})
            AND c.relowner = r.oid
        ) AS "ownsProtected"
      FROM pg_roles r WHERE r.rolname = current_user
    `,
    database.$queryRaw<Array<{ tableName: string }>>`
      SELECT required.table_name AS "tableName"
      FROM unnest(${[...RLS_PROTECTED_TABLES]}::text[]) AS required(table_name)
      LEFT JOIN pg_class c
        ON c.relname = required.table_name
       AND c.relnamespace = 'public'::regnamespace
      WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
    `,
  ]);
  const role = roleRows[0];
  if (!role || role.superuser || role.bypassRls || role.ownsProtected) {
    throw new Error(
      'The API database role must not be a superuser, BYPASSRLS role, or owner of protected tables',
    );
  }
  if (unprotectedRows.length > 0) {
    throw new Error(
      `PostgreSQL row-level security is incomplete: ${unprotectedRows.map((row) => row.tableName).join(', ')}`,
    );
  }
}

async function assertRlsTransactionReady(tx: Prisma.TransactionClient): Promise<void> {
  const [roleRows, unprotectedRows] = await Promise.all([
    tx.$queryRaw<Array<{ superuser: boolean; bypassRls: boolean; ownsProtected: boolean }>>`
      SELECT r.rolsuper AS "superuser", r.rolbypassrls AS "bypassRls",
        EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY(${[...RLS_PROTECTED_TABLES]})
            AND c.relowner = r.oid
        ) AS "ownsProtected"
      FROM pg_roles r WHERE r.rolname = current_user
    `,
    tx.$queryRaw<Array<{ tableName: string }>>`
      SELECT required.table_name AS "tableName"
      FROM unnest(${[...RLS_PROTECTED_TABLES]}::text[]) AS required(table_name)
      LEFT JOIN pg_class c
        ON c.relname = required.table_name
       AND c.relnamespace = 'public'::regnamespace
      WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
    `,
  ]);
  const role = roleRows[0];
  if (
    !role ||
    role.superuser ||
    role.bypassRls ||
    role.ownsProtected ||
    unprotectedRows.length > 0
  ) {
    throw new Error('PostgreSQL row-level security is not enforceable for the API database role');
  }
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
    rawClient = undefined;
  }
}
