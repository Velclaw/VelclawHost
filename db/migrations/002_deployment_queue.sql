CREATE TABLE IF NOT EXISTS deployment_jobs (
  id text PRIMARY KEY,
  deployment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','claimed','completed','retryable_failed','terminal_failed')),
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deployment_jobs_ready_idx
  ON deployment_jobs (status, available_at, priority DESC, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS deployment_jobs_active_deployment_idx
  ON deployment_jobs (deployment_id)
  WHERE status IN ('queued','claimed','retryable_failed');

COMMENT ON TABLE deployment_jobs IS 'Durable VelclawHost deployment queue with leases, retries and idempotency.';
