import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Finding } from "./types.js";

export class GitleaksNotFoundError extends Error {
  constructor() {
    super("gitleaks gak ketemu di PATH. Install: https://github.com/gitleaks/gitleaks#installing");
    this.name = "GitleaksNotFoundError";
  }
}

interface GitleaksRawFinding {
  File?: string;
  StartLine?: number;
  RuleID?: string;
  Description?: string;
}

function runGitleaksProcess(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gitleaks", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new GitleaksNotFoundError());
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`gitleaks exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

// gitleaks report never carries the raw secret value into a Finding here —
// printing/logging matched secrets would itself be a leak.
export function parseGitleaksReport(json: string): Finding[] {
  const trimmed = json.trim();
  if (trimmed.length === 0) return [];

  const raw: unknown = JSON.parse(trimmed);
  if (!Array.isArray(raw)) return [];

  const findings: Finding[] = [];
  for (const entry of raw as GitleaksRawFinding[]) {
    if (
      typeof entry.File !== "string" ||
      typeof entry.StartLine !== "number" ||
      typeof entry.RuleID !== "string"
    ) {
      continue;
    }
    findings.push({
      file: entry.File,
      line: entry.StartLine,
      ruleId: entry.RuleID,
      description: entry.Description ?? entry.RuleID,
    });
  }
  return findings;
}

export async function runSecretScan(targetDir: string): Promise<Finding[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "vibe-secret-scan-"));
  const reportPath = join(tempDir, "gitleaks-report.json");

  try {
    await runGitleaksProcess([
      "detect",
      "--source",
      targetDir,
      "--no-git",
      "--no-banner",
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
