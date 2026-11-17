# VelclawHost — Central Auth Gateway integration

VelclawHost's account UI uses the shared OCodeJS Identity service from
[zskbot/Authentication](https://github.com/zskbot/Authentication). It does not
create a second user store or persist passwords/session tokens in browser storage.

## Client configuration

Set this public build-time variable for the deployment that should use the gateway:

```env
VITE_AUTH_API_BASE_URL=https://<verified-auth-api-host>
```

The value is an HTTPS API origin, without a path or trailing slash. It is not a
secret. Do not put database credentials, session secrets, CSRF secrets, SMTP
credentials, or OAuth client secrets in Vite variables.

The UI uses these gateway routes:

- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/request-password-reset`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/me`
- `POST /api/v1/auth/logout`

All state-changing requests first obtain a CSRF token, send it in
`X-CSRF-Token`, and include cookies using `credentials: include`. The session
cookie is HttpOnly; the client never reads or stores it.

## Required gateway deployment configuration

The gateway is a Node.js 22+ Fastify service and requires its own PostgreSQL
database. Production also requires SMTP delivery. Configure the following in
the gateway host's secret/environment manager:

- `DATABASE_URL`
- `SESSION_SECRET` (independent random value, at least 32 characters)
- `CSRF_SECRET` (different independent random value, at least 32 characters)
- `NODE_ENV=production`
- `APP_BASE_URL` (public URL of the account UI handling verification/reset links)
- `WEB_ORIGINS` (comma-separated exact HTTPS origins, including the VelclawHost UI origin)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`
- `TRUST_PROXY_HOPS` only after the actual reverse-proxy topology is known

Use a gateway hostname on the same registrable site as the VelclawHost custom
domain where possible. The gateway currently sets SameSite=Lax cookies. A
Cloudflare Pages `*.pages.dev` Preview is cross-site from `*.velclaw.app`;
modern browsers may block the session cookie on cross-site fetches. Do not
declare Preview login operational until the cookie/CORS flow is verified in a
real browser on the intended hostnames.

## Current implementation boundary

The current Cloudflare Free Preview worker is static-only and explicitly reports
`authSessionValidation: false`. This client integration does not enable API
routes, provision a database, configure SMTP, change DNS, or turn on production
authentication. The gateway's Google/GitHub OAuth and OIDC issuer are not
implemented in `zskbot/Authentication`; provider buttons must not be presented
as working until that repository implements and tests those flows.

## Verification before activation

1. Deploy the gateway to an approved Node.js host and attach a dedicated PostgreSQL database.
2. Configure secrets only in the host's secret manager and run `npm run db:migrate`.
3. Confirm `GET /health`, registration + email verification, login, `GET /api/v1/me`, logout, reset-password, CSRF rejection, and rate limits.
4. Verify browser cookies, exact CORS origin, TLS, and session persistence on the actual VelclawHost hostname.
5. Set `VITE_AUTH_API_BASE_URL` for a Preview build and only then consider enabling authenticated routes.


## Authorization boundary

The account modal and client-side gate are user-experience controls, not a substitute
for server-side authorization. Any future control-plane API that exposes private
projects, credentials, deployments, or account data must independently validate
the gateway session and enforce its own least-privilege policy on every request.
Do not expose privileged API routes based only on the React `authUser` state.

No production deployment or infrastructure mutation is implied by this document.
