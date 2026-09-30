# Project Guidelines & Rules: Estate Manager

## UI & Design Instructions
1. **NO EMOJIS IN DESIGN OR CODE**:
   - Strictly avoid the use of emojis in UI design, components, typography, buttons, cards, toasts, modals, and user-facing copy.
   - Always use clean, professional SVG / Lucide React icons (e.g., `CheckCircle2`, `AlertTriangle`, `CreditCard`, `ShieldCheck`, etc.) paired with enterprise proptech typography.
   - Notifications and toast alerts must use Lucide icons with appropriate status badge colors instead of emoji prefixes.

2. **Design System & Fidelity**:
   - Primary Accent: Warm Orange (`#FF5A1F` / Tailwind `primary`).
   - Clean, elevated cards with subtle borders (`border-slate-200/80`) and refined drop shadows (`shadow-card`).
   - Nigerian Naira (`₦`) currency symbol with proper formatting (e.g., `₦8,950,000`).
   - 100% responsive layouts across Desktop, Tablet, and Mobile devices with scalable, reusable components.

3. **Motion & Transitions**:
   - Provide purposeful load animations for analytics, charts, meters, and metrics (staggered bar growth, radial donut sweep, smooth number counters).
   - Ensure transitions are fluid (`transition-all duration-300 ease-in-out`) without layout thrashing.

4. **Security & Secrets**:
   - Never commit `.env` or log database passwords/connection strings.
