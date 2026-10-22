# ADR — Money as integer kobo, rendered via shared formatter

- Status: accepted
- Date: 2026-10-22
- Phase: 0

## Context

Nigerian currency: 1 Naira (₦) = 100 kobo. Floating-point money (e.g.
`8.95` for ₦8.95) drifts in totals and makes equality comparisons unreliable
across services.

## Decision

- All monetary values are persisted, transported, and computed as **integer
  kobo** (`number`, within safe-integer range).
- Schema fields are named `*Kobo` (`amountKobo`, `registrationFeeKobo`, ...).
- The UI never prints a raw number: every display goes through
  `formatNaira(kobo)` from `@silverstone/shared` (Intl `en-NG`, currency
  `NGN`), e.g. `8_950_000` → `₦89,500.00`.
- Conversion helpers: `nairaToKobo`, `koboToNaira`, `assertKobo`, `sumKobo`.
- The shared package owns the contract; API and web both import it. No other
  code path may format money.

## Consequences

- API responses always use kobo; the web client is the sole formatter.
- Future multi-currency support changes one helper, not a data migration.
- Invariants are testable: `assertKobo` rejects non-integers and out-of-range
  values at the boundary.
