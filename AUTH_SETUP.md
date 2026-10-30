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
- Database-backed rate limiting for login, registration, verification and password reset.
- Protected /dashboard route; signed-in users are redirected there after login.

## Required environment variables

Configure these in Vercel Preview first. Never commit credentials or paste them into source files.

- AUTH_SECRET — high-entropy Auth.js secret shared with the Express control-plane.
- AUTH_URL — canonical URL, https://velclawhost.velclaw.app (use the Preview URL for Preview tests).
- AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.
- AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.
- AUTH_DATABASE_URL — dedicated PostgreSQL connection string for the Auth.js Prisma adapter.
- AUTH_DIRECT_URL — direct PostgreSQL connection string used for auth migrations.
- RESEND_API_KEY and EMAIL_FROM — required for registration verification and password reset email.
- VELCLAWHOST_ADMIN_EMAIL — email address that receives the owner role in the control-plane.
- VELCLAWHOST_API_TOKEN — optional server-to-server bearer token for trusted service calls.

OAuth callback URLs:
- https://velclawhost.velclaw.app/api/auth/callback/github
- https://velclawhost.velclaw.app/api/auth/callback/google

Register the callback URLs with the corresponding OAuth provider applications
before testing. Use a separate GitHub OAuth App for VelClawHost so the existing
Cloudxx callback configuration is not overwritten.

## Staging database

A separate Supabase Free project named `velclawhost-auth-staging` was
provisioned in Singapore. The Prisma schema and initial migration are included
in this branch. Apply the migration to that staging database and configure
AUTH_DATABASE_URL / AUTH_DIRECT_URL in Vercel Preview before enabling sign-in.

The five Auth.js tables are in the exposed `public` schema. Enable RLS on
`User`, `Account`, `Session`, `VerificationToken`, and `AuthRateLimit`.
Do not add public/anon access policies: Auth.js accesses these tables through
the server-side Prisma connection, not from the browser Data API.

This database is separate from Cloudxx and VelClawSQL; no existing data is
copied, modified or deleted.

## Control-plane session bridge and Preview routing

- Auth.js is the only browser-session issuer.
- The Express control-plane middleware validates the Auth.js encrypted JWT
  using `getToken()`; it must receive the exact same `AUTH_SECRET` as Next.js.
- `next.config.mjs` keeps `/api/auth/*` inside Next.js and proxies other
  `/api/*` routes to `VELCLAWHOST_API_ORIGIN`.
- The default API origin is the existing Render service. Do not use that
  Production service for Preview authentication tests. Create/configure a
  separate staging backend from this branch and set
  `VELCLAWHOST_API_ORIGIN` as a Preview-only variable to that staging URL.
- Keep all credentials Preview-only until OAuth, email, session sharing, and
  dashboard API flows pass end-to-end tests.

## Deployment and verification status

- Vercel Preview builds the Next.js app and publishes the login/dashboard and
  Auth.js API routes.
- A READY Preview deployment does not prove OAuth, email delivery, database
  persistence, or the Express session bridge works.
- The Preview environment must contain the required credentials and a staging
  API origin before end-to-end auth testing can pass.
- No Production environment changes, Production deploy, or PR merge are
  included in this work.
