# Gate Check — Review Before Recording

**Status:** Implemented and verified
**Scope:** The guard verification flow on `/app/gate`. No changes to the gate
register, the guard home or the resident portal.

## Objective

A gate check used to record the attempt the moment the guard submitted a code,
then show the visitor's details. That meant a mistyped code, a wrong direction
or an abandoned check wrote a permanent, audited denial before the guard could
see who was actually at the gate.

This step splits the check into two steps:

1. **Look up** — resolve the code and show visitor, car plate, ID image,
   resident, property, code status, validity and the outcome that _would_ occur.
2. **Confirm** — the guard accepts those details; only then is the entry/exit
   recorded, audited and added to the log.

## Non-goals

- No changes to how an outcome is decided. The same `decide()` rules
  (`NOT_FOUND`, `REVOKED`, `EXPIRED`, `WRONG_DIRECTION`, otherwise `GRANTED`)
  run in both the preview and the recording call.
- No changes to the verification log, filters, summaries or the access-code
  register.
- No new permission. A lookup is a gate action, so it requires `gate.manage`
  exactly like recording.
- No client-side decision. The preview is computed server-side from the stored
  hash and validity window; the client never receives the code or its hash.

## Decisions

- **Preview is side-effect free.** `POST /verifications/preview` writes no
  `AccessVerification` row and no audit event. The existing `POST /verifications`
  remains the only writer, so the log stays append-only and complete.
- **The preview returns the outcome, not just the record.** The server runs the
  full decision twice — once for review, once for recording. A code can therefore
  expire between the two calls; the recorded outcome is always the authoritative
  one, and the result screen shows what was actually written.
- **Unknown codes can still be recorded.** A lookup that finds nothing shows
  "No matching code" and offers "Record denied attempt", so a guard can log a
  refused visitor without inventing a code.
- **Confirmation is explicit.** A grant confirms the physical movement
  ("Confirm entry" / "Confirm exit"); a denial or unknown code records the
  attempt ("Record denied attempt"). The confirm button changes tone to danger
  for denials.
- **Nothing is hidden behind the review.** The preview shows the same fields the
  result screen shows, plus code kind/status/validity, so the guard can spot a
  wrong-direction or near-expiry code before accepting.
- The code is trimmed and uppercased for both calls; the full code is never
  stored, logged or returned.

## Surfaces

| Surface                                     | Detail                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/v1/verifications/preview`        | `{ code, gate }` → `OperatorVerifyAccessCodePreviewResponse`. Requires `gate.manage`. No writes. |
| `packages/shared/src/resident-contract.ts`  | `OperatorVerifyAccessCodePreview`, `OperatorVerifyAccessCodePreviewResponse`                     |
| `apps/api/src/modules/gate/gate.service.ts` | `preview()` plus shared `normalizeCode()` / `accessCodeStatus()` helpers                         |
| `apps/web/src/api/client.ts`                | `previewAccessCode()`                                                                            |
| `apps/web/src/pages/GatePage.tsx`           | Two-step modal: code form → review screen → recorded result                                      |

## Verification

- API (`operator-gate.test.ts`): preview resolves a valid code with visitor,
  resident and property context; the verification and audit counts are unchanged
  after a preview; expired and unknown codes preview as `DENIED` with the right
  reason; auditors and residents get `403`; unauthenticated gets `401`.
- Web: helper tests for the review headline (`Access would be granted`,
  `Access would be denied`, `No matching code`) and the confirmation labels
  (`Confirm entry`, `Confirm exit`, `Record denied attempt`).
- Full web suite: 91 tests across 21 files. Typecheck, lint, format, shared build
  and production web build pass.

## Rollback

- Revert the modal to the single-step form and restore `submitVerification()`.
- Remove `previewAccessCode()` from the client, `preview()` from the service and
  the `/verifications/preview` route.
- The contract additions are additive and can stay in place.
