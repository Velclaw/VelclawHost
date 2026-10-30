import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.AUTH_DIRECT_URL ||
  process.env.AUTH_DATABASE_URL ||
  'postgresql://build:build@127.0.0.1:5432/velclawhost_auth';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
