# VelClawHost Auth.js staging setup

Auth.js v5 uses GitHub and Google OAuth with an 8-hour encrypted JWT session.
The dashboard route checks the session server-side before rendering the
existing dashboard.

## Required Preview environment variables

- AUTH_SECRET: unique high-entropy secret (generate with openssl rand -base64 32).
- AUTH_URL: use the Preview URL for Preview validation; canonical host is https://velclawhost.velclaw.app.
- AUTH_ALLOWED_EMAILS: comma-separated exact email allowlist.
- AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.
- AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.

OAuth callback URLs:
- GitHub: /api/auth/callback/github
- Google: /api/auth/callback/google

Never commit credentials or .env files.

## Staging database

A separate Supabase Free project was provisioned:
velclawhost-auth-staging (qylvacxnkhkmytgismqu, Singapore).

This first Auth.js cut uses encrypted JWT sessions and does not yet connect
Supabase Postgres through an adapter. The database password is not available
through project metadata, and no database URL is configured. Do not point this
application at VelClawSQL. Add a Postgres adapter only after a dedicated
staging connection string has been securely provisioned.

## Security notes

- Access is denied by default unless email is in AUTH_ALLOWED_EMAILS.
- Google sign-ins require email_verified=true.
- Do not grant owner/admin roles from OAuth profile claims.
- The legacy Express /auth surface and any legacy backend auth endpoints must
  be retired or bridged before claiming the entire API/control plane is protected.
- No production deployment or OAuth provider configuration is performed here.
