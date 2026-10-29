# Operator Console — Phase 8: Operational Settings

**Status:** Implemented and verified locally
**Scope:** Curated operational settings only — onboarding fee, access-code
validity, bank-transfer instructions and predefined emergency contacts.
Administrator/account settings stay in `AdministratorsPage` and `AccountPage`.

## Objective

Give the estate office one place to change the operating values that affect
residents every day, without exposing the structural configuration document.
An operator can:

- set the one-off onboarding/registration fee;
- choose the default validity window for resident gate codes;
- publish bank-transfer instructions used on onboarding and unpaid invoices;
- maintain the emergency numbers shown with the SOS action.

Settings are operational configuration. They are not module switches, asset
model editing, property-option editing or role administration.

Phase 8 delivers:

- a `GET /api/v1/settings` read route and `PATCH /api/v1/settings` update route;
- `config.manage` enforcement on both routes;
- optimistic concurrency through `expectedVersion`;
- a versioned config write that archives the previous active document;
- a `settings.updated` audit event on every successful write;
- an operator `/app/settings` page behind the same permission;
- resident-facing propagation of bank-transfer details and SOS contacts;
- configured access-code duration used by resident code generation.

## Non-goals

- No Administrator settings. Staff accounts, roles and the signed-in user's
  password remain on `AdministratorsPage` and `AccountPage`.
- No structural configuration editing: no `assetModel`, `propertyOptions`,
  `modules`, `roles` or custom fields.
- No module enable/disable control. Facilities remains off by default and its
  rollout remains separate.
- No online payment provider integration. Payment is still verified manually.
- No second resident portal, duplicate resident query or new resident-owned
  settings surface.
- No database migration: the new values live inside the existing versioned
  organization-config JSON document.

## Configuration additions

The config document remains schema version `1.0.0`; the new sections are
optional on read and receive defaults, so existing production documents keep
parsing.

```json
{
  "accessCodes": {
    "defaultDurationHours": 720
  },
  "payments": {
    "bankTransfer": {
      "bankName": null,
      "accountName": null,
      "accountNumber": null,
      "sortCode": null,
      "instructions": null
    }
  },
  "sos": {
    "contacts": []
  }
}
```

Rules:

- `accessCodes.defaultDurationHours` is an integer from 1 to 8760 (a year).
  The previous `defaultDurationDays` field is converted on read, so a stored
  custom window survives the unit change.
- Bank name, account name and account number are all-or-nothing. A
  half-configured account is rejected because residents would see unusable
  instructions.
- Account numbers are 10–20 digits.
- At most 12 emergency contacts. Each has a stable client-generated id, label,
  phone, category, optional note, active flag and sort order. Duplicate ids are
  rejected.
- Blank strings from the UI are stored as `null`.
- The API mapper also treats stored blank strings as unconfigured, so legacy or
  hand-edited documents cannot render an empty payment block.

## API

### `GET /api/v1/settings`

Returns the curated view:

```ts
{
  version: number;
  onboarding: { registrationFee: { amountKobo, currency, description, refundable } };
  accessCodes: { defaultDurationHours, minDurationHours, maxDurationHours };
  payments: { bankTransfer: { bankName, accountName, accountNumber, sortCode, instructions } };
  sos: { contacts: SosContactDto[] };
}
```

Never included: `assetModel`, `propertyOptions`, `modules`, `roles`,
`customFields`, `propertyOptions` or the raw config payload.

### `PATCH /api/v1/settings`

Accepts only the curated sections. Omitted sections are left untouched; `null`
clears a nullable field. `expectedVersion` is checked twice:

1. against the cached-bypassed active config before merging;
2. inside the write transaction against the latest committed version.

The second check closes the race between two operators saving the same version.
A stale write returns `409 CONFLICT`.

The merged document is fully parsed with the config-schema package. Invalid
values return `400 VALIDATION_ERROR` with field paths. A successful write
creates the next config version, invalidates the 30-second config cache and
records `settings.updated` with the new version and changed sections.

Both routes require `config.manage`; hiding the navigation item is only a
display convenience.

## Propagation to existing surfaces

- **Onboarding:** `OnboardingGuestView.paymentDetails` carries the configured
  bank-transfer block. The step-4 payment screen renders it before the manual
  reference field.
- **Resident finance:** `ResidentFinanceView.paymentDetails` carries the same
  block. The invoices page shows it when outstanding bills exist.
- **Resident SOS:** `ResidentSosEventsResponse.contacts` carries active
  contacts in sort order, rendered as `tel:` links.
- **Operator SOS:** `OperatorSosEventsResponse.contacts` carries the same active
  contacts in a compact strip above the queue.
- **Access codes:** `ResidentAccessCodesResponse.defaultDurationHours` seeds
  the resident generate form. Omitting a duration on generate or extend uses
  the configured default server-side. Existing codes keep their issued expiry.

These additions reuse the existing resident queries. No duplicate resident
endpoints or client caches were introduced.

## UI

`/app/settings` is permission-gated and contains four cards:

1. Onboarding fee — naira input converted to kobo, description and refundable
   flag.
2. Access codes — default duration from 1 to 8760 hours.
3. Payment details — bank name, account name, account number, sort code and
   instructions.
4. Emergency contacts — add, edit, activate/deactivate and remove; the
   displayed order is persisted on save.

The page reads through React Query with the shared `queryKeys.settings` key,
updates the cache after save, and invalidates resident query data without an
immediate refetch. The header Refresh behavior and the 30-second API config
cache are unchanged.

## Verification

- API settings route tests: authentication, permission, curated shape, stale
  version, partial bank merge, invalid account number, incomplete bank details,
  structural-field rejection, audit event and mapper filtering.
- Config-schema tests: defaults, duration bounds, all-or-nothing bank details,
  malformed phone numbers and duplicate contact ids.
- Resident access-code integration test asserts the configured default is
  returned.
- Full workspace verification: API and web test suites, format, lint,
  typecheck and production build.

## Deployment

No Prisma migration is required. Existing active config documents are read with
defaults for the new sections. The first settings save writes a new config
version, so rollback is a matter of reactivating the previous version rather
than reverting a schema migration.
