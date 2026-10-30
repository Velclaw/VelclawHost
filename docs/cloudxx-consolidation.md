# Cloudxx consolidation into VelclawHost

## Decision

`Velclaw/VelclawHost` is the canonical application and repository. The product name is **VelclawHost**. `Velclaw/Cloudxx` remains an untouched source/reference repository during the consolidation and rollback window; this plan does not archive, delete, rename, or modify it.

## Feature selection

### Keep from VelclawHost (canonical implementation)

- Hosting control plane, deployment lifecycle, runtime worker, build/health-check orchestration.
- Domain inventory and lifecycle, registrar adapters, DNS management, DNS verification, TLS/SSL.
- Infrastructure metrics, charts, alerts, logs, security/2FA, API integration/keys, reports and developer tools.
- Existing dark responsive dashboard, navigation, and current API contracts where possible.
- Existing owner/member authorization policy and allowlist semantics; administrative actions remain role-gated.

### Import selectively from Cloudxx

- Auth.js v5 as the single authentication/session implementation.
- Email/password credentials with bcrypt password hashes.
- GitHub and Google OAuth providers.
- Email verification and password-reset flows with single-use token digests.
- Persistent user/profile records and database-backed auth rate limiting.
- Auth-related tests and security hardening, adapted to VelclawHost route contracts and role model.

### Do not duplicate

Cloudxx's domain/DNS/registrar screens, domain CRUD, DNS record CRUD, DNS/SSL management, metrics, audit/log views and dashboard shell are not copied as separate modules because VelclawHost already owns these capabilities. Reuse or adapt only non-duplicated security logic and data contracts after review.

## Target application structure

- `/`: route to the canonical login page for guests; route authenticated users to `/dashboard`.
- `/login`: VelclawHost-branded login UI, preserving the existing host visual system.
- `/register`, `/verify-email`, `/forgot-password`, `/reset-password`: Auth.js credentials lifecycle.
- `/dashboard`: existing VelclawHost console, protected by the Auth.js session.
- Existing hosting/domain/DNS/metrics/deployment API routes remain canonical; add a shared server-side authorization adapter that maps Auth.js users to the existing owner/member policy.

## Data and security rules

1. Use one explicitly provisioned PostgreSQL database for the consolidated application only after backup and schema review.
2. Do not reuse Cloudxx's old Supabase integration variables or blindly reuse its database connection.
3. Do not copy Cloudxx's `Domain`, `DNSRecord`, or registrar tables over the VelclawHost domain/control-plane model. Define explicit adapters/mapping only if a concrete field is missing.
4. Preserve existing VelclawHost state and user records. Any migration must be additive, reviewed, backed up, and tested on a staging database.
5. Keep legacy Supabase data and the Cloudxx repository intact until account export/import, reconciliation, and rollback are verified.
6. Secrets remain in Vercel/hosting secret stores; never commit OAuth secrets, database URLs, mail API keys, JWT/Auth secrets, or tokens.
7. Do not broaden the allowed-user policy. OAuth identities must be verified and mapped to explicit roles; unknown users must not gain owner access.
8. No production deployment, DNS mutation, registrar transfer, destructive migration, data deletion, or repository merge is authorized by this branch.

## Implementation phases and acceptance gates

### Phase 1 — Auth integration
- Port Auth.js config, route handlers, Prisma auth models, email verification/reset, rate limiting, and tests.
- Preserve the VelclawHost login design and route users to the existing dashboard after successful sign-in.
- Add role mapping and server-side guards for every privileged API.
- Verify callback URLs for GitHub and Google against the actual Preview hostname.

### Phase 2 — Schema and data
- Reconcile Auth.js user/profile schema with VelclawHost's persistent state model.
- Review current PostgreSQL migrations and take a verified backup before applying any migration.
- Test with an isolated staging database; never auto-run destructive migrations in production.
- Keep legacy Cloudxx/Supabase records available for reconciliation; do not silently discard or merge accounts by unverified email.

### Phase 3 — UI and feature deduplication
- Replace Cloudxx product labels with VelclawHost.
- Keep the existing VelclawHost dashboard and navigation.
- Remove only duplicated Cloudxx presentation/routes after their equivalent VelclawHost implementation is confirmed; do not delete the original Cloudxx repository.

### Phase 4 — Verification
- CI: typecheck, lint, unit/integration tests, dependency/security checks.
- Preview: guest route, credentials registration/login, email verification, reset flow, GitHub OAuth, Google OAuth, session refresh/logout, dashboard redirect, owner/member RBAC, API authorization.
- Regression: domains, DNS, TLS, registrar, deployments, runtime worker, metrics, alerts, logs and API keys.
- Confirm Preview commit SHA and deployment association. Production cutover is a separate approval.

## Current evidence and blockers

- Cloudxx main already contains Auth.js v5, Credentials/GitHub/Google providers, Prisma models, bcrypt, email verification/reset and rate limiting.
- Cloudxx's current Auth.js code uses `src/auth.ts` and `src/app/api/auth/[...nextauth]/route.ts`.
- Cloudxx Vercel environment inventory showed variable names for `AUTH_SECRET` and GitHub OAuth, but values were intentionally not read. Google OAuth, mail delivery and a dedicated Auth.js PostgreSQL connection were not verified.
- VelclawHost already has a native OAuth/session implementation and owner/member allowlist semantics. This must be replaced or adapted deliberately, not run in parallel with a second independent session system.
- The VelclawHost Next.js migration is on main after PR #16. PostgreSQL pool/state work in PR #17 remains separate and must be reviewed/verified before any dependency on it.
- No live end-to-end OAuth or database migration is claimed complete.

## Definition of done

One VelclawHost application and dashboard; one Auth.js session system; one explicit user/role model; one canonical domain/DNS/hosting implementation; no duplicate Cloudxx dashboard or domain modules; all checks green; Preview end-to-end flows verified; rollback and data reconciliation documented. Production cutover only after separate explicit approval.
