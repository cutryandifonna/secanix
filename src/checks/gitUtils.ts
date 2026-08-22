import { spawn } from "node:child_process";
import { basename } from "node:path";

// Returns the set of forward-slash relative paths staged/committed in
// targetDir's git index, or null when targetDir isn't a git repo (no
// tracking info to report).
export function listTrackedFiles(targetDir: string): Promise<Set<string> | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", targetDir, "ls-files", "-z", "--cached"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(new Set(stdout.split("\0").filter((f) => f.length > 0)));
    });
  });
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
