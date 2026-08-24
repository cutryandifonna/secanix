import { spawn } from "node:child_process";
import { basename } from "node:path";

// Runs `git <args>` and returns raw stdout on success (exit code 0), or
// null when the process errors (e.g. git missing) or exits non-zero (e.g.
// targetDir isn't a git repo) — every check that shells out to git for a
// simple "run and read stdout" query builds on this instead of writing its
// own spawn/collect/resolve-null wrapper.
export function runGit(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      resolve(code === 0 ? stdout : null);
    });
  });
}

// Returns the set of forward-slash relative paths staged/committed in
// targetDir's git index, or null when targetDir isn't a git repo (no
// tracking info to report).
export async function listTrackedFiles(targetDir: string): Promise<Set<string> | null> {
  const stdout = await runGit(["-C", targetDir, "ls-files", "-z", "--cached"]);
  if (stdout === null) return null;
  return new Set(stdout.split("\0").filter((f) => f.length > 0));
}

const TRACKED_CONTEXT = " File ini ke-track di git — kemungkinan udah ke-commit ke repo.";
const UNTRACKED_CONTEXT =
  " File ini gitignored atau belum ke-commit — tapi kalau var ini pernah dipasang di production (Vercel dst) dengan prefix NEXT_PUBLIC_, tetap ke-inline ke client bundle.";

// Two checks (exposedServiceRoleKey, exposedFirebaseAdminKey) scan raw
// filesystem .env files without git-awareness, so a gitignored/local-only
// var reads the same as a committed one. Appending this note keeps their
// CRITICAL severity honest about which case it actually is.
export function envFileTrackingContext(relFile: string, tracked: Set<string> | null): string {
  if (!basename(relFile).startsWith(".env")) return "";
  if (tracked === null) return "";
  return tracked.has(relFile) ? TRACKED_CONTEXT : UNTRACKED_CONTEXT;
}
