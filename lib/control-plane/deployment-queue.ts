import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

function sqlString(value: string) {
  return "'" + value.replace(/'/g, "''") + "'";
}

class PostgresDeploymentQueue implements DeploymentQueueStore {
  constructor(private readonly databaseUrl: string) {}

  private async query(sql: string) {
    const { stdout } = await execFileAsync("psql", [
      this.databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  }

  async enqueue(input: Omit<QueueJob, "attempts" | "status">) {
    const raw = await this.query(`INSERT INTO deployment_jobs
      (id, deployment_id, status, priority, attempts, max_attempts, available_at, created_at)
      VALUES (${sqlString(input.id)}, ${sqlString(input.deploymentId)}, 'queued', ${input.priority}, 0, ${input.maxAttempts}, ${sqlString(input.availableAt)}::timestamptz, NOW())
      ON CONFLICT (deployment_id) WHERE status IN ('queued','claimed','retryable_failed')
      DO UPDATE SET available_at = LEAST(deployment_jobs.available_at, EXCLUDED.available_at), priority = GREATEST(deployment_jobs.priority, EXCLUDED.priority)
      RETURNING id, deployment_id, status, priority, attempts, max_attempts, available_at, claimed_at, claimed_by, started_at, completed_at, last_error;`);
    return this.parse(raw);
  }

  async claim(workerId: string) {
    const raw = await this.query(`WITH candidate AS (
      SELECT id FROM deployment_jobs
      WHERE status IN ('queued','retryable_failed') AND available_at <= NOW() AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE deployment_jobs j
    SET status='claimed', attempts=j.attempts+1, claimed_at=NOW(), claimed_by=${sqlString(workerId)}, started_at=NOW()
    FROM candidate
    WHERE j.id=candidate.id
    RETURNING j.id, j.deployment_id, j.status, j.priority, j.attempts, j.max_attempts, j.available_at, j.claimed_at, j.claimed_by, j.started_at, j.completed_at, j.last_error;`);
    return raw ? this.parse(raw) : null;
  }

  async complete(jobId: string) {
    await this.query(`UPDATE deployment_jobs SET status='completed', completed_at=NOW(), last_error=NULL WHERE id=${sqlString(jobId)}`);
  }

  async retry(jobId: string, error: string, delayMs: number) {
    const raw = await this.query(`UPDATE deployment_jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'terminal_failed' ELSE 'queued' END,
          available_at = NOW() + (${Math.max(1000, delayMs)} || ' milliseconds')::interval,
          last_error = ${sqlString(error)},
          completed_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END
      WHERE id=${sqlString(jobId)}
      RETURNING status;`);
    return raw as "queued" | "terminal_failed";
  }

  async fail(jobId: string, error: string) {
    await this.query(`UPDATE deployment_jobs SET status='terminal_failed', completed_at=NOW(), last_error=${sqlString(error)} WHERE id=${sqlString(jobId)}`);
  }

  async stats() {
    const raw = await this.query("SELECT status, COUNT(*) FROM deployment_jobs GROUP BY status");
    const result: Record<string, number> = {};
    for (const line of raw.split("\n").filter(Boolean)) {
      const [status, count] = line.split("|");
      result[status] = Number(count);
    }
    return result;
  }

  private parse(raw: string): QueueJob {
    const [id,deploymentId,status,priority,attempts,maxAttempts,availableAt,claimedAt,claimedBy,startedAt,completedAt,lastError] = raw.split("|");
    return { id, deploymentId, status: status as QueueJob["status"], priority:Number(priority), attempts:Number(attempts), maxAttempts:Number(maxAttempts), availableAt, claimedAt:claimedAt||null, claimedBy:claimedBy||null, startedAt:startedAt||null, completedAt:completedAt||null, lastError:lastError||null };
  }
}

class InMemoryDeploymentQueue implements DeploymentQueueStore {
  private readonly jobs = new Map<string, QueueJob>();

  async enqueue(input: Omit<QueueJob, "attempts" | "status">) {
    const existing = [...this.jobs.values()].find((job) => job.deploymentId === input.deploymentId && ['queued','claimed','retryable_failed'].includes(job.status));
    if (existing) return existing;
    const job = { ...input, status: 'queued' as const, attempts: 0, claimedAt:null, claimedBy:null, startedAt:null, completedAt:null, lastError:null };
    this.jobs.set(job.id, job);
    return job;
  }

  async claim(workerId: string) {
    const candidate = [...this.jobs.values()]
      .filter((job) => ['queued','retryable_failed'].includes(job.status) && new Date(job.availableAt).getTime() <= Date.now() && job.attempts < job.maxAttempts)
      .sort((a,b) => b.priority - a.priority || a.availableAt.localeCompare(b.availableAt))[0];
    if (!candidate) return null;
    candidate.status = 'claimed';
    candidate.attempts += 1;
    candidate.claimedAt = new Date().toISOString();
    candidate.claimedBy = workerId;
    candidate.startedAt = candidate.claimedAt;
    return candidate;
  }

  async complete(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job) { job.status='completed'; job.completedAt=new Date().toISOString(); job.lastError=null; }
  }

  async retry(jobId: string, error: string, delayMs: number) {
    const job = this.jobs.get(jobId);
    if (!job) return 'terminal_failed' as const;
    job.lastError = error;
    if (job.attempts >= job.maxAttempts) { job.status='terminal_failed'; job.completedAt=new Date().toISOString(); return 'terminal_failed' as const; }
    job.status='queued';
    job.availableAt=new Date(Date.now()+Math.max(1000,delayMs)).toISOString();
    job.claimedAt=null;
    job.claimedBy=null;
    return 'queued' as const;
  }

  async fail(jobId: string, error: string) {
    const job=this.jobs.get(jobId);
    if (job) { job.status='terminal_failed'; job.completedAt=new Date().toISOString(); job.lastError=error; }
  }

  async stats() {
    const result: Record<string, number> = {};
    for (const job of this.jobs.values()) result[job.status] = (result[job.status] || 0) + 1;
    return result;
  }
}

export function createDeploymentQueue(databaseUrl?: string): DeploymentQueueStore {
  return databaseUrl?.trim() ? new PostgresDeploymentQueue(databaseUrl.trim()) : new InMemoryDeploymentQueue();
}
