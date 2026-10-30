import { Pool } from "pg";

const pools = new Map<string, Pool>();

export function getPostgresPool(connectionString: string): Pool {
  const key = connectionString.trim();
  if (!key) throw new Error("A PostgreSQL connection string is required.");
  let pool = pools.get(key);
  if (!pool) {
    pool = new Pool({
      connectionString: key,
      max: Number(process.env.PG_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "velclawhost-control-plane",
    });
    pool.on("error", (error) => {
      console.error("[postgres] idle client error:", error.message);
    });
    pools.set(key, pool);
  }
  return pool;
}
