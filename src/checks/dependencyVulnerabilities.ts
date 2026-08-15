import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { Finding } from "./types.js";

export class OsvScannerNotFoundError extends Error {
  constructor() {
    super("osv-scanner gak ketemu di PATH. Install: https://google.github.io/osv-scanner/installation/");
    this.name = "OsvScannerNotFoundError";
  }
}

interface OsvRawGroup {
  ids?: string[];
  aliases?: string[];
  max_severity?: string;
}

interface OsvRawPackage {
  package?: { name?: string; version?: string };
  groups?: OsvRawGroup[];
}

interface OsvRawResult {
  source?: { path?: string };
  packages?: OsvRawPackage[];
}

export interface DependencyVulnerability {
  file: string;
  packageName: string;
  ruleId: string;
  description: string;
}

function runOsvScannerProcess(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("osv-scanner", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new OsvScannerNotFoundError());
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      // osv-scanner exits 1 when it finds vulnerabilities — not a run failure.
      if (code === 0 || code === 1) {
        resolvePromise(stdout);
      } else {
        reject(new Error(`osv-scanner exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

export function parseOsvReport(json: string): DependencyVulnerability[] {
  const trimmed = json.trim();
  if (trimmed.length === 0) return [];

  const raw: unknown = JSON.parse(trimmed);
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { results?: unknown }).results)) {
    return [];
  }

  const findings: DependencyVulnerability[] = [];
  for (const result of (raw as { results: OsvRawResult[] }).results) {
    if (typeof result.source?.path !== "string") continue;

    for (const pkg of result.packages ?? []) {
      if (typeof pkg.package?.name !== "string" || typeof pkg.package?.version !== "string") continue;

      for (const group of pkg.groups ?? []) {
        const ruleId = group.ids?.[0];
        if (typeof ruleId !== "string") continue;

        const aliases = (group.aliases ?? []).join(", ") || ruleId;
        const severity = group.max_severity ? ` (severity ${group.max_severity})` : "";
        findings.push({
          file: result.source.path,
          packageName: pkg.package.name,
          ruleId,
          description: `${pkg.package.name}@${pkg.package.version} kena kerentanan dikenal: ${aliases}${severity}.`,
        });
      }
    }
  }
  return findings;
}

// osv-scanner's JSON output doesn't carry line numbers — best-effort locate
// the package name's first mention in its own lockfile as an anchor.
function findLineForPackage(content: string, packageName: string): number {
  const needle = `"${packageName}"`;
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index === -1 ? 1 : index + 1;
}

export async function findDependencyVulnerabilities(targetDir: string): Promise<Finding[]> {
  const stdout = await runOsvScannerProcess([
    "scan",
    "source",
    "-r",
    "--allow-no-lockfiles",
    "--format",
    "json",
    targetDir,
  ]);
  const rawFindings = parseOsvReport(stdout);

  const contentCache = new Map<string, string>();
  const findings: Finding[] = [];

  for (const raw of rawFindings) {
    // osv-scanner's source.path may be relative to targetDir rather than to
    // our own cwd (e.g. when targetDir is a subdirectory) — resolve once and
    // reuse it for both the line lookup and the reported file path so they
    // agree on the same file.
    const absolutePath = resolve(targetDir, raw.file);
    let content = contentCache.get(raw.file);
    if (content === undefined) {
      content = await readFile(absolutePath, "utf8").catch(() => "");
      contentCache.set(raw.file, content);
    }

    findings.push({
      file: relative(targetDir, absolutePath).split(sep).join("/"),
      line: findLineForPackage(content, raw.packageName),
      ruleId: raw.ruleId,
      description: raw.description,
    });
  }

  return findings;
}
