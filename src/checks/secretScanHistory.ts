import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listTrackedFiles } from "./gitUtils.js";
import { GITLEAKS_CONFIG_PATH, parseGitleaksReport, runGitleaksProcess } from "./secretScan.js";
import type { Finding } from "./types.js";

export { GitleaksNotFoundError } from "./secretScan.js";

// Runs gitleaks directly against the repo (no --no-git, no working-tree
// mirror) so it walks full `git log -p` history, unlike runSecretScan in
// secretScan.ts which only ever looks at the current working tree.
export async function runSecretScanHistory(targetDir: string): Promise<Finding[]> {
  const tracked = await listTrackedFiles(targetDir);
  if (tracked === null) return [];

  const tempDir = await mkdtemp(join(tmpdir(), "vibe-secret-scan-history-"));
  const reportPath = join(tempDir, "gitleaks-report.json");

  try {
    await runGitleaksProcess([
      "detect",
      "--source",
      targetDir,
      "--no-banner",
      "--config",
      GITLEAKS_CONFIG_PATH,
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      "--exit-code",
      "0",
    ]);

    const content = await readFile(reportPath, "utf8").catch(() => "");
    return parseGitleaksReport(content);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
