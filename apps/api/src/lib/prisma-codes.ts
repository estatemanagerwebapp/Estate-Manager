/**
 * Prisma error code detection.
 *
 * P2002 is the "unique constraint violation" code. It is the authoritative
 * backstop for identifier-collision handling on the single-property create
 * path: the application pre-checks and reports a friendly 409, and the
 * database unique index guarantees no duplicate is ever written even under
 * a race.
 *
 * Note: the bulk-import commit path does NOT rely on catching P2002. It uses
 * `INSERT ... ON CONFLICT (estate_id, identifier) DO NOTHING` (see
 * `createInTxSkipDuplicates` in the property repository) so the transaction
 * stays clean under concurrent commits. `isP2002` is kept for the
 * single-property create path and for any future P2002-based 409 mapping.
 */

export const P2002_CONFLICT_CODE = 'P2002';

/** True when `error` is a Prisma unique-constraint violation (P2002). */
export function isP2002(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === P2002_CONFLICT_CODE;
}
