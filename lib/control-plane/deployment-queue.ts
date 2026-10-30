import { getPostgresPool } from "../../db/client";

export type QueueJob = {
  id: string;
  deploymentId: string;
  status: "queued" | "claimed" | "completed" | "retryable_failed" | "terminal_failed";
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  claimedAt?: string | null;
  claimedBy?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
};

export type DeploymentQueueStore = {
  enqueue(job: Omit<QueueJob, "attempts" | "status">): Promise<QueueJob>;
  claim(workerId: string): Promise<QueueJob | null>;
  complete(jobId: string): Promise<void>;
  retry(jobId: string, error: string, delayMs: number): Promise<"queued" | "terminal_failed">;
  fail(jobId: string, error: string): Promise<void>;
  stats(): Promise<Record<string, number>>;
};

class PostgresDeploymentQueue implements DeploymentQueueStore {
  constructor(private readonly databaseUrl: string) {}

  private get pool() {
    return getPostgresPool(this.databaseUrl);
  }

  async enqueue(input: Omit<QueueJob, "attempts" | "status">): Promise<QueueJob> {
    const result = await this.pool.query(
      `INSERT INTO deployment_jobs
        (id, deployment_id, status, priority, attempts, max_attempts, available_at, created_at)
       VALUES ($1, $2, 'queued', $3, 0, $4, $5::timestamptz, NOW())
       ON CONFLICT (deployment_id) WHERE status IN ('queued','claimed','retryable_failed')
       DO UPDATE SET available_at = LEAST(deployment_jobs.available_at, EXCLUDED.available_at),
                     priority = GREATEST(deployment_jobs.priority, EXCLUDED.priority)
       RETURNING id, deployment_id, status, priority, attempts, max_attempts, available_at,
                 claimed_at, claimed_by, started_at, completed_at, last_error`,
      [input.id, input.deploymentId, input.priority, input.maxAttempts, input.availableAt]
    );
    return this.mapRow(result.rows[0]);
  }

  async claim(workerId: string): Promise<QueueJob | null> {
    const result = await this.pool.query(
      `WITH candidate AS (
         SELECT id FROM deployment_jobs
         WHERE status IN ('queued','retryable_failed') AND available_at <= NOW() AND attempts < max_attempts
         ORDER BY priority DESC, created_at ASC
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE deployment_jobs j
       SET status='claimed', attempts=j.attempts+1, claimed_at=NOW(), claimed_by=$1, started_at=NOW()
       FROM candidate WHERE j.id=candidate.id
       RETURNING j.id, j.deployment_id, j.status, j.priority, j.attempts, j.max_attempts,
                 j.available_at, j.claimed_at, j.claimed_by, j.started_at, j.completed_at, j.last_error`,
      [workerId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async complete(jobId: string): Promise<void> {
    await this.pool.query(
      "UPDATE deployment_jobs SET status='completed', completed_at=NOW(), last_error=NULL WHERE id=$1",
      [jobId]
    );
  }

  async retry(jobId: string, error: string, delayMs: number): Promise<"queued" | "terminal_failed"> {
    const result = await this.pool.query(
      `UPDATE deployment_jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'terminal_failed' ELSE 'queued' END,
           available_at = NOW() + ($3::bigint * INTERVAL '1 millisecond'),
           last_error = $2,
           completed_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END,
           claimed_at = NULL, claimed_by = NULL
       WHERE id=$1 RETURNING status`,
      [jobId, error, Math.max(1000, delayMs)]
    );
    return (result.rows[0]?.status ?? "terminal_failed") as "queued" | "terminal_failed";
  }

  async fail(jobId: string, error: string): Promise<void> {
    await this.pool.query(
      "UPDATE deployment_jobs SET status='terminal_failed', completed_at=NOW(), last_error=$2 WHERE id=$1",
      [jobId, error]
    );
  }

  async stats(): Promise<Record<string, number>> {
    const result = await this.pool.query("SELECT status, COUNT(*)::int AS count FROM deployment_jobs GROUP BY status");
    return Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count)]));
  }

  private mapRow(row: Record<string, unknown>): QueueJob {
    return {
      id: String(row.id),
      deploymentId: String(row.deployment_id),
      status: row.status as QueueJob["status"],
      priority: Number(row.priority),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      availableAt: new Date(String(row.available_at)).toISOString(),
      claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : null,
      claimedBy: row.claimed_by ? String(row.claimed_by) : null,
      startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
      completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
      lastError: row.last_error ? String(row.last_error) : null,
    };
  }
}

class InMemoryDeploymentQueue implements DeploymentQueueStore {
  private readonly jobs = new Map<string, QueueJob>();

  async enqueue(input: Omit<QueueJob, "attempts" | "status">): Promise<QueueJob> {
    const existing = [...this.jobs.values()].find((job) => job.deploymentId === input.deploymentId && ["queued", "claimed", "retryable_failed"].includes(job.status));
    if (existing) return existing;
    const job: QueueJob = { ...input, status: "queued", attempts: 0, claimedAt: null, claimedBy: null, startedAt: null, completedAt: null, lastError: null };
    this.jobs.set(job.id, job);
    return job;
  }

  async claim(workerId: string): Promise<QueueJob | null> {
    const candidate = [...this.jobs.values()]
      .filter((job) => ["queued", "retryable_failed"].includes(job.status) && new Date(job.availableAt).getTime() <= Date.now() && job.attempts < job.maxAttempts)
      .sort((a, b) => b.priority - a.priority || a.availableAt.localeCompare(b.availableAt))[0];
    if (!candidate) return null;
    candidate.status = "claimed";
    candidate.attempts += 1;
    candidate.claimedAt = new Date().toISOString();
    candidate.claimedBy = workerId;
    candidate.startedAt = candidate.claimedAt;
    return candidate;
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) { job.status = "completed"; job.completedAt = new Date().toISOString(); job.lastError = null; }
  }

  async retry(jobId: string, error: string, delayMs: number): Promise<"queued" | "terminal_failed"> {
    const job = this.jobs.get(jobId);
    if (!job) return "terminal_failed";
    job.lastError = error;
    if (job.attempts >= job.maxAttempts) { job.status = "terminal_failed"; job.completedAt = new Date().toISOString(); return "terminal_failed"; }
    job.status = "queued";
    job.availableAt = new Date(Date.now() + Math.max(1000, delayMs)).toISOString();
    job.claimedAt = null;
    job.claimedBy = null;
    return "queued";
  }

  async fail(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) { job.status = "terminal_failed"; job.completedAt = new Date().toISOString(); job.lastError = error; }
  }

  async stats(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const job of this.jobs.values()) result[job.status] = (result[job.status] || 0) + 1;
    return result;
  }
}

export function createDeploymentQueue(databaseUrl?: string): DeploymentQueueStore {
  return databaseUrl?.trim() ? new PostgresDeploymentQueue(databaseUrl.trim()) : new InMemoryDeploymentQueue();
}
