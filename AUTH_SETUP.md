# VelClawHost Auth — ported from Cloudxx

VelClawHost uses the same Auth.js v5 authentication flow as
[Velclaw/Cloudxx](https://github.com/Velclaw/Cloudxx), with product branding
changed to VelClawHost. The hosting dashboard and control-plane UI remain
VelClawHost-owned.

## Included authentication flows

- GitHub and Google OAuth via Auth.js.
- Email/password registration and sign-in.
- Email verification with single-use, hashed tokens.
- Password reset with expiring, single-use tokens.
- bcrypt password hashing.
- Prisma adapter and PostgreSQL persistence.
- Database-backed rate limiting for registration, verification and password reset.
- Protected /dashboard route; signed-in users are redirected there after login.

## Required environment variables

- AUTH_SECRET — high-entropy Auth.js secret.
- AUTH_URL — canonical URL, https://velclawhost.velclaw.app (Preview URL for Preview tests).
- AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.
- AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.
- AUTH_DATABASE_URL — dedicated PostgreSQL connection string for the Auth.js Prisma adapter.
- AUTH_DIRECT_URL — direct PostgreSQL connection string used for auth migrations.
- RESEND_API_KEY and EMAIL_FROM — required for registration verification and password reset email.

OAuth callback URLs:
- https://velclawhost.velclaw.app/api/auth/callback/github
- https://velclawhost.velclaw.app/api/auth/callback/google

Do not copy OAuth secrets into source control. Register the callback URLs with
the corresponding OAuth provider applications before testing.

## Staging database

A separate Supabase Free project named `velclawhost-auth-staging` was
provisioned in Singapore. The Prisma schema and initial migration are included
in this branch. Apply the migration to that staging database and configure
AUTH_DATABASE_URL / AUTH_DIRECT_URL in Vercel Preview before enabling sign-in.

This database is separate from Cloudxx and VelClawSQL; no existing data is
copied, modified or deleted.

## Deployment and security

- Keep credentials in Preview-only environment variables until the OAuth and
  email flows pass end-to-end tests.
- No Production environment changes or deployment are included in this PR.
- The legacy Express API still has its own JWT auth middleware; it must be
  bridged to Auth.js before claiming all control-plane APIs share one session.
