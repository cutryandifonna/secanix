import { runGit } from "./gitUtils.js";
import { runGitleaksDetectAndParse } from "./secretScan.js";
import type { Finding } from "./types.js";

// Any secret currently committed at HEAD is, by definition, also part of
// git history — so an un-deduped history scan double-reports it as two
// separate CRITICAL findings (secret-scan + secret-scan-history) for the
// same file+ruleId. That's the dominant case, not an edge case: this check
// is meant to add value for secrets ALREADY removed from the working tree,
// which secret-scan's own working-tree scan can no longer see.
//
// secretHash is what keeps that dedup from over-matching: a rotated-out
// secret and a still-committed one can share file+ruleId while being totally
// different values, and dropping the rotated one would hide exactly what this
// check is for. When either side lacks a hash we fall back to file+ruleId so
// this stays a strictly looser filter than before, never a stricter one.
// ponytail: O(n*m) — findings lists are tiny; index by file+ruleId if that changes.
export function excludeFindingsAlreadyInWorkingTree(
  historyFindings: Finding[],
  workingTreeFindings: Finding[]
): Finding[] {
  const sameSecret = (a: Finding, b: Finding) =>
    a.file === b.file &&
    a.ruleId === b.ruleId &&
    (!a.secretHash || !b.secretHash || a.secretHash === b.secretHash);

  return historyFindings.filter((f) => !workingTreeFindings.some((w) => sameSecret(f, w)));
}

// Returns targetDir's path relative to its repo's top-level, with a
// trailing slash (e.g. "apps/web/"), "" when targetDir IS the repo root, or
// null when targetDir isn't inside a git repo. Delegates the path math to
// git itself (--show-prefix) instead of comparing resolved paths by hand —
// git's own resolution can differ from Node's `resolve()` on Windows (e.g.
// TEMP env vars using 8.3 short names like PEMBUR~1 that git expands to the
// real long name), which broke a naive string-prefix comparison.
async function getRepoPrefix(targetDir: string): Promise<string | null> {
  const stdout = await runGit(["-C", targetDir, "rev-parse", "--show-prefix"]);
  return stdout === null ? null : stdout.trim();
}

// Runs gitleaks directly against the repo (no --no-git, no working-tree
// mirror) so it walks full `git log -p` history, unlike runSecretScan in
// secretScan.ts which only ever looks at the current working tree.
//
// gitleaks' git-history mode reports File relative to the repo root
// regardless of --source, and `git log -p` isn't scoped by --source either
// (it always walks the whole repo's history) — so when targetDir is a
// subdirectory of a bigger repo, findings outside targetDir are filtered
// out and paths are rewritten back to targetDir-relative, matching the
// convention every other check follows.
export async function runSecretScanHistory(targetDir: string): Promise<Finding[]> {
  const prefix = await getRepoPrefix(targetDir);
  if (prefix === null) return [];

  const findings = await runGitleaksDetectAndParse(["--source", targetDir], "vibe-secret-scan-history-");

  if (prefix === "") return findings;

  const scoped: Finding[] = [];
  for (const finding of findings) {
    const fileFwd = finding.file.replace(/\\/g, "/");
    if (!fileFwd.startsWith(prefix)) continue;
    scoped.push({ ...finding, file: fileFwd.slice(prefix.length) });
  }
  return scoped;
}
