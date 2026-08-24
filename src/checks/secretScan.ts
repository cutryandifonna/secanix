import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runGit } from "./gitUtils.js";
import type { Finding } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const GITLEAKS_CONFIG_PATH = join(__dirname, "..", "rules", "gitleaks-config.toml");

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
  Commit?: string;
  Date?: string;
  Secret?: string;
}

export function runGitleaksProcess(args: string[]): Promise<void> {
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
// printing/logging matched secrets would itself be a leak. Only a SHA-256 of
// it goes in (secretHash), enough for dedup to distinguish two different
// secrets sharing a file+ruleId, and cli.ts strips even that before output.
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
    let description = entry.Description ?? entry.RuleID;
    if (entry.Commit) {
      description += ` (commit ${entry.Commit.slice(0, 7)}, ${entry.Date ?? "?"})`;
    }

    findings.push({
      file: entry.File,
      line: entry.StartLine,
      ruleId: entry.RuleID,
      description,
      ...(entry.Secret ? { secretHash: createHash("sha256").update(entry.Secret).digest("hex") } : {}),
    });
  }
  return findings;
}

// Shared by every check that shells out to gitleaks: makes a scratch temp
// dir for the JSON report, runs gitleaks with sourceArgs (the caller
// supplies whatever --source/--no-git flags fit its own scan mode), parses
// the result, and always cleans up the temp dir. Callers that need their
// own temp workspace first (e.g. building a gitignore-filtered mirror)
// manage that separately — this only owns the report's own temp dir.
export async function runGitleaksDetectAndParse(sourceArgs: string[], tempDirPrefix: string): Promise<Finding[]> {
  const tempDir = await mkdtemp(join(tmpdir(), tempDirPrefix));
  const reportPath = join(tempDir, "gitleaks-report.json");

  try {
    await runGitleaksProcess([
      "detect",
      ...sourceArgs,
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

// Returns tracked + untracked-but-not-ignored relative paths, or null when
// targetDir isn't a git repo (no .gitignore semantics to respect there).
async function listGitRespectedFiles(targetDir: string): Promise<string[] | null> {
  const stdout = await runGit(["-C", targetDir, "ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (stdout === null) return null;
  return stdout.split("\0").filter((f) => f.length > 0);
}

// Mirrors the given relative paths into mirrorRoot so gitleaks (run with
// --no-git) only ever sees files .gitignore would let through.
async function mirrorFiles(sourceDir: string, files: string[], mirrorRoot: string): Promise<void> {
  for (const rel of files) {
    const dest = join(mirrorRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(sourceDir, rel), dest).catch(() => {});
  }
}

export async function runSecretScan(targetDir: string): Promise<Finding[]> {
  const mirrorTempDir = await mkdtemp(join(tmpdir(), "vibe-secret-scan-mirror-"));

  try {
    const respectedFiles = await listGitRespectedFiles(targetDir);
    let scanDir = targetDir;
    if (respectedFiles !== null) {
      scanDir = join(mirrorTempDir, "mirror");
      await mkdir(scanDir, { recursive: true });
      await mirrorFiles(targetDir, respectedFiles, scanDir);
    }

    const findings = await runGitleaksDetectAndParse(["--source", scanDir, "--no-git"], "vibe-secret-scan-report-");

    // gitleaks reports File as an absolute path built from --source (which
    // is scanDir here, mirror or not) — strip that prefix so every check
    // agrees on the same targetDir-relative, forward-slash file format.
    // Mirror dir is deleted below, so this also rewrites mirror paths to
    // point at the real project instead of the throwaway copy.
    const scanDirPrefix = scanDir.replace(/\\/g, "/");
    return findings.map((finding) => {
      const fileFwd = finding.file.replace(/\\/g, "/");
      if (!fileFwd.startsWith(scanDirPrefix)) return { ...finding, file: fileFwd };
      const rel = fileFwd.slice(scanDirPrefix.length).replace(/^\/+/, "");
      return { ...finding, file: rel };
    });
  } finally {
    await rm(mirrorTempDir, { recursive: true, force: true });
  }
}
