/**
 * Playwright globalTeardown — tears down everything global-setup.ts started:
 * the manually-spawned `next dev` process (see global-setup.ts for why it's
 * not managed via `config.webServer`) and the disposable Postgres container.
 * Runs after all specs finish (success or failure), so we never leave
 * `fiknow-e2e-pg` or an orphaned dev server running.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { E2E_DEV_SERVER_PIDFILE, E2E_PG_CONTAINER } from "./env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const LOG = "[e2e/global-teardown]";

function killDevServer(): void {
  const pidfile = path.resolve(REPO_ROOT, E2E_DEV_SERVER_PIDFILE);
  if (!existsSync(pidfile)) {
    console.log(`${LOG} No dev-server pidfile found — nothing to kill.`);
    return;
  }
  const pid = Number.parseInt(readFileSync(pidfile, "utf-8").trim(), 10);
  rmSync(pidfile, { force: true });
  if (!Number.isFinite(pid) || pid <= 0) {
    console.warn(`${LOG} Pidfile contained an invalid pid — skipping kill.`);
    return;
  }
  console.log(`${LOG} Killing dev-server process group (pid ${pid}) …`);
  try {
    // Negative pid = signal the whole process group (spawned with
    // detached:true in global-setup.ts, so `next dev` + its compiler
    // workers all share this group).
    process.kill(-pid, "SIGTERM");
  } catch (err) {
    console.warn(`${LOG} Killing dev-server process group failed (may already be gone):`, err);
  }
}

function removePostgresContainer(): void {
  console.log(`${LOG} Removing container ${E2E_PG_CONTAINER} …`);
  try {
    execSync(`docker rm -f ${E2E_PG_CONTAINER}`, { stdio: "inherit" });
  } catch (err) {
    console.warn(
      `${LOG} docker rm -f failed (container may already be gone):`,
      err,
    );
  }
}

export default async function globalTeardown(): Promise<void> {
  killDevServer();
  removePostgresContainer();
}
