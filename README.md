# Estate Manager Web App & Gate Security Ecosystem

Enterprise-grade, multi-tenant residential property management and sub-5-second gate security platform.

---

## 🏗️ Architecture Overview

The system is organized into a modular workspace layout following Section 56 of the BRD Specification:

```
Estate Manager/
├── client/                     # Vite + React 18 + Tailwind CSS PWA
│   ├── src/
│   │   ├── components/ui/      # Atomic UI primitives (Button, Card, Input, Modal, Badge)
│   │   ├── context/            # AuthContext, ThemeContext, EstateContext
│   │   ├── layouts/            # AppLayout (Responsive Desktop Sidebar & Mobile Bottom Nav)
│   │   ├── pages/              # Role-specific modules (Resident, Guard, Admin, Super Admin)
│   │   ├── services/           # Axios instance with auth interceptors & API client
│   │   └── routes/             # AppRoutes & Role-Protected Routes
│   └── index.html              # PWA manifest & viewport configuration
│
├── server/                     # Node.js + Express + Mongoose (7-Layer Defensive Pipeline)
│   ├── config/                 # Database pooling (db.js) & Environment variables (env.js)
│   ├── controllers/            # Auth, Gate Verification, Code Issuance, Billing, Admin
│   ├── middleware/             # Auth, RBAC, Estate Scope (Anti-BOLA), Sanitization, Rate-Limiting
│   ├── models/                 # Mongoose schemas with soft-delete & immutable audit hooks
│   ├── routes/                 # Express API routers mounted under /api
│   ├── integrations/           # Idempotent external onboarding sync engine
│   └── server.js               # Express application entrypoint
│
├── shared/                     # Cross-tier constants, role matrices & Zod validation schemas
│   ├── constants/              # Roles, Access Code statuses, Property types
│   ├── permissions/            # Granular permission definitions & role mapping matrix
│   └── schemas/                # Shared Zod schemas (Auth, Access Codes, Gate Verification)
│
├── design/                     # UI Blueprint, interactive prototypes, and mockup screens
├── .env.example                # Canonical environment variable specification
├── package.json                # Monorepo NPM workspace configuration
└── README.md
```

---

## ⚡ Key Highlights & Competitive Moat

1. **Sub-5-Second Gate Verification:**
   - Dedicated Guard Gate interface with high-contrast day/night mode.
   - Fast numeric entry, gate camera photo validation, and instant arrival alerts to resident hosts.

2. **Surgical Debt-Enforcement (Rules 11, 12, 13):**
   - Unlike legacy systems that freeze user accounts and prevent them from paying dues, Estate Manager allows Super Admins to disable access code generation exclusively (`accessControlStatus: DISABLED`).
   - The resident can still log in, review itemized bills, and make payments online.

3. **Multi-Tenant Estate Isolation (Anti-BOLA / IDOR):**
   - 7-Layer security pipeline enforces role, permissions, and estate tenant boundaries (`x-estate-id`) on every protected route.

4. **Idempotent External Ingestion Engine:**
   - Handles bulk or real-time onboarding data sync via `/api/integrations/onboarding/sync` without duplicate record generation.

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
Install all workspace dependencies across client, server, and shared:
```bash
npm install
```

### 2. Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env
```

### 3. Launch Development Mode
Run both the Backend API (Port 5000) and the Frontend React Application (Port 5173) concurrently:
```bash
npm run dev
```

Alternatively, run tiers independently:
- **Backend API only:** `npm run dev:server` (http://localhost:5000)
- **Frontend App only:** `npm run dev:client` (http://localhost:5173)
- **Design Prototype:** `npm run dev:prototype` (http://localhost:8000)

---

## 🧪 Testing & Verification
Run the backend test suite:
```bash
npm run test
```
