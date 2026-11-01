# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: React + Vite + Tailwind web console (`apps/web`), Express + TypeScript API (`apps/api`), shared packages (`packages/`). Deploy target: Vercel multi-service (api on /api/_, web on /_).

## Users

Primary visitor to the Foundation (public landing) page: property owners and investors evaluating estate management services. Secondary visitors: residents accessing the resident portal, operators evaluating the management console.

## Product Purpose

Config-driven estate management platform that brings international standards and local insight to property, estate and facility management in Lagos, Nigeria. Organization configuration is provisioned into PostgreSQL and becomes the source of truth once the database holds an active document.

## Positioning

International standards, local understanding — thoughtfully run estates, cared-for facilities, stronger communities. Nigerian context (Africa/Lagos timezone, NGN currency, en-NG locale). The differentiating mechanism is a validated organization configuration that is provisioned into PostgreSQL and governs estates, residents, properties, assignments, billing, payments, gate access, and maintenance.

## Operating Context

Lagos, Nigeria. Web-first public landing page linked from silverstonemanagers.com. Primary audience evaluates the service and seeks a path to engage (sign in, onboard, contact). All account types use the shared /login entry point; successful sign-in routes each user to their role-specific console. The operator console lives at /app and the resident portal at /resident/app.

## Capabilities and Constraints

- Phase 0 foundation ships: health polling, money demo (kobo integer math, formatNaira en-NG/NGN), organization config bootstrap
- Phase 1 identity/auth/RBAC/audit is complete (login, sessions, password reset, user management, audit events)
- Phase 2 (estates, billing, onboarding) not yet started
- No payment provider integration yet (Zest keys/webhooks are Phase 4)
- Primary brand color: #FF5A1F (warm orange); name: Silverstone Managers; slug: silverstone; portal name: Silverstone Resident Portal

## Brand Commitments

Name: Silverstone Managers. Primary color: #FF5A1F. Slug: silverstone. Timezone: Africa/Lagos. Currency: NGN. Locale: en-NG. Portal name: Silverstone Resident Portal. No emoji; icons from Lucide. Warm orange primary accent, neutral surface.

## Evidence on Hand

- README.md — repo layout, prerequisites, quick start, architecture notes
- docs/phase-0.md, docs/phase-1.md — Phase deliverables and verification
- docs/environment.md — production environment variable checklist
- config/organization.default.json — bootstrap defaults (branding, modules, fees, onboarding, house types)
- prisma/schema.prisma, prisma/seed.ts — organization + config schema and idempotent seed
- Live site reference: https://silverstonemanagers.com/ (property & facility management, estate operations, rent management)

## Product Principles

1. Configuration precedes code — organization config is the source of truth, provisioned into PostgreSQL.
2. Nigerian context first — NGN money (integer kobo), Africa/Lagos timezone, en-NG locale.
3. Fail-fast validation — env and config validated at startup with secret-free errors.
4. No fabricated claims — prices, customers, benchmarks, and capabilities the product does not have are never invented.
5. Accessible by design — keyboard focus, contrast ≥4.5:1, working controls at every breakpoint.

## Accessibility & Inclusion

WCAG 2.2 AA target for public and console surfaces: contrast, focus states, keyboard navigation, responsive composition.
