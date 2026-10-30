import { createHash } from 'node:crypto';
import { prisma } from './prisma';

const RATE_LIMIT_RETENTION_MS = 15 * 60 * 1000;
const RATE_LIMIT_CLEANUP_SAMPLE_RATE = 0.01;

export async function consumeAuthRateLimit(
  request: { headers: Headers },
  scope: string,
  maxAttempts: number,
  windowMs: number,
): Promise<boolean> {
  // x-real-ip is set by the trusted hosting proxy; do not trust client-supplied X-Forwarded-For.
  const address = request.headers.get('x-real-ip') ?? 'unknown';
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

  // All current auth scopes use 15-minute windows. Keep cleanup sampled and
  // bounded so expired keys do not grow forever or add work to every request.
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
