import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ControlPlaneState = {
  version: 1;
  nextRuntimePort: number;
  domains: Array<Record<string, unknown>>;
  deployments: Array<Record<string, unknown>>;
  runtimes: Array<Record<string, unknown>>;
};

export interface ControlPlaneStateStore {
  load(): Promise<ControlPlaneState | null>;
  save(state: ControlPlaneState): Promise<void>;
}

class FileStateStore implements ControlPlaneStateStore {
  constructor(private readonly stateFile: string) {}

  async load(): Promise<ControlPlaneState | null> {
    try {
      return JSON.parse(await fs.readFile(this.stateFile, "utf8")) as ControlPlaneState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(state: ControlPlaneState): Promise<void> {
    const dir = path.dirname(this.stateFile);
    await fs.mkdir(dir, { recursive: true });
    const tempFile = this.stateFile + ".tmp";
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2) + "\n", "utf8");
    await fs.rename(tempFile, this.stateFile);
  }
}

class PostgresStateStore implements ControlPlaneStateStore {
  constructor(private readonly databaseUrl: string) {}

  private async query(sql: string) {
    const { stdout } = await execFileAsync("psql", [
      this.databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  }

  async load(): Promise<ControlPlaneState | null> {
    const raw = await this.query("SELECT state::text FROM control_plane_state WHERE id = 1");
    return raw ? JSON.parse(raw) as ControlPlaneState : null;
  }

  async save(state: ControlPlaneState): Promise<void> {
    const json = JSON.stringify(state).replace(/'/g, "''");
    await this.query(`BEGIN;\nINSERT INTO control_plane_state (id, state, updated_at)
VALUES (1, '${json}'::jsonb, NOW())
ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW();\nCOMMIT;`);
  }
}

export function createControlPlaneStateStore(options: {
  store?: string;
  stateFile: string;
  databaseUrl?: string;
}): ControlPlaneStateStore {
  const store = (options.store || "file").toLowerCase();
  if (store === "postgres") {
    if (!options.databaseUrl) throw new Error("DATABASE_URL is required when VELCLAWHOST_STATE_STORE=postgres.");
    return new PostgresStateStore(options.databaseUrl);
  }
  if (store !== "file") throw new Error(`Unsupported VELCLAWHOST_STATE_STORE: ${store}`);
  return new FileStateStore(options.stateFile);
}
