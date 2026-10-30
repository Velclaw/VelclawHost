import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The local fallback lets Next.js collect route metadata during a Preview build
// before a dedicated database has been connected. Runtime auth/database actions
// still require DATABASE_URL or DIRECT_URL to point at the new PostgreSQL store.
const connectionString =
  process.env.AUTH_DATABASE_URL ??
  process.env.AUTH_DIRECT_URL ??
  process.env.DATABASE_URL ??
  process.env.DIRECT_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  'postgresql://build:build@127.0.0.1:5432/cloudxx';

const adapter = new PrismaPg({ connectionString });
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
