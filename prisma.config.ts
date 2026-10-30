import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.AUTH_DIRECT_URL ||
  process.env.AUTH_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  'postgresql://build:build@127.0.0.1:5432/velclawhost';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
