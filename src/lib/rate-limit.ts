import { createHash } from 'node:crypto';
import { prisma } from './prisma';

const RATE_LIMIT_RETENTION_MS = 15 * 60 * 1000;
const RATE_LIMIT_CLEANUP_SAMPLE_RATE = 0.01;

type HeaderReader = {
  get?: (name: string) => string | null;
};

function readHeader(headers: HeaderReader | undefined, name: string): string {
  try {
    const value = headers?.get?.(name);
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function getClientAddress(headers: HeaderReader | undefined): string {
  // The app is deployed behind Vercel/Cloudflare ingress. Prefer the
  // platform/proxy address headers; use the first forwarded address only
  // when the trusted ingress has supplied the forwarding chain.
  const candidates = [
    readHeader(headers, 'x-real-ip'),
    readHeader(headers, 'cf-connecting-ip'),
    readHeader(headers, 'x-vercel-forwarded-for'),
    readHeader(headers, 'x-forwarded-for').split(',')[0]?.trim() ?? '',
  ];
  const address = candidates.find((value) => value && value.toLowerCase() !== 'unknown');
  if (address) return address;

  // Never put every visitor into one shared "unknown" bucket. A stable,
  // low-entropy browser fingerprint is only a fallback when ingress does
  // not expose a client address; it is not used for authentication.
  const userAgent = readHeader(headers, 'user-agent').slice(0, 256);
  const language = readHeader(headers, 'accept-language').slice(0, 128);
  const clientHint = readHeader(headers, 'sec-ch-ua').slice(0, 128);
  return `fallback:${userAgent}:${language}:${clientHint}`;
}

export async function consumeAuthRateLimit(
  request: { headers?: HeaderReader } | null | undefined,
  scope: string,
  maxAttempts: number,
  windowMs: number,
): Promise<boolean> {
  const address = getClientAddress(request?.headers);
  const key = createHash('sha256').update(`${scope}:${address}`).digest('hex');
  const now = new Date();
  const windowExpiredBefore = new Date(now.getTime() - windowMs);

  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "windowStartedAt", "attempts", "updatedAt")
    VALUES (${key}, ${now}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${windowExpiredBefore} THEN 1
        ELSE "AuthRateLimit"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${windowExpiredBefore} THEN ${now}
        ELSE "AuthRateLimit"."windowStartedAt"
      END,
      "updatedAt" = ${now}
    RETURNING "attempts"
  `;

  const allowed = (rows[0]?.attempts ?? maxAttempts + 1) <= maxAttempts;

  if (Math.random() < RATE_LIMIT_CLEANUP_SAMPLE_RATE) {
    const expiredBefore = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
    try {
      await prisma.$executeRaw`
        DELETE FROM "AuthRateLimit"
        WHERE "updatedAt" < ${expiredBefore}
          AND "key" IN (
            SELECT "key"
            FROM "AuthRateLimit"
            WHERE "updatedAt" < ${expiredBefore}
            ORDER BY "updatedAt" ASC
            LIMIT 500
          )
      `;
    } catch {
      // Retention is best-effort; it must not block authentication requests.
    }
  }

  return allowed;
}
