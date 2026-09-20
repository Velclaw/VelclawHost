CREATE TABLE IF NOT EXISTS control_plane_state (
  id integer PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_plane_state_updated_at_idx
  ON control_plane_state (updated_at);

COMMENT ON TABLE control_plane_state IS 'VelclawHost control-plane snapshot. Single-row state store for the current prototype.';
