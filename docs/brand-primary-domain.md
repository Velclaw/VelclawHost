# VelClawHost brand and primary domain

## Canonical identity

- Product / application brand: **VelClawHost**
- Authentication surface: **VelClawHost Auth**
- Signed-in workspace: **VelClawHost Dashboard**
- Primary application origin: **https://velclawhost.velclaw.app**
- Canonical URL metadata must use the primary origin.
- Preserve existing dashboard navigation, feature set, and visual design while applying the brand consistently.

## Authentication and routing contract

- Guest visits to the primary origin must be directed to the VelClawHost-branded sign-in experience.
- After successful authentication, redirect to the existing VelClawHost Dashboard.
- The Auth.js session is the single session source after the Cloudxx/Auth.js consolidation is implemented.
- The dashboard and privileged APIs must enforce server-side session and owner/member authorization. A custom domain must never be treated as proof of authentication.
- OAuth callback URLs for the primary origin:
  - GitHub: `https://velclawhost.velclaw.app/api/auth/callback/github`
  - Google: `https://velclawhost.velclaw.app/api/auth/callback/google`
- Keep provider secrets in Vercel environment variables; never commit credentials.

## Domain state and cutover

- `velclaw.app` is an existing, verified domain in the Vercel team and uses Cloudflare nameservers.
- `velclawhost.velclaw.app` has been attached to the VelclawHost Vercel project and Vercel reports it as verified.
- This does not by itself prove the application is ready for public traffic: verify the Preview/Production deployment, Auth.js configuration, callback URLs, session cookies, and access controls first.
- Do not change nameservers, Cloudflare records, existing domain redirects, or other production hostnames as part of this branding change.
- Keep existing domains available during the migration. Any redirect from legacy hostnames to the primary origin requires a separate review after end-to-end auth tests.

## Existing implementation status

- The Next.js root layout now publishes VelClawHost metadata and the canonical origin.
- The root loading state identifies the signed-in application as VelClawHost Dashboard.
- Auth.js integration and the final guest-to-dashboard redirect remain separate implementation and verification gates; do not claim those flows are live until tested on the primary domain.
