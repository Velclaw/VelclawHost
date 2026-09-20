CREATE TABLE IF NOT EXISTS certificates (
  id text PRIMARY KEY,
  domain_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','issuing','active','failed')),
  issuer text,
  serial_number text,
  not_before timestamptz,
  not_after timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificates_domain_idx ON certificates (domain_id);
CREATE INDEX IF NOT EXISTS certificates_status_idx ON certificates (status);
