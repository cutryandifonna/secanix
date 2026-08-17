import { spawn } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULE_PATH = join(__dirname, "..", "rules", "nextjs-api-auth-missing.yaml");

export class SemgrepNotFoundError extends Error {
  constructor() {
    super("semgrep gak ketemu di PATH. Install: https://semgrep.dev/docs/getting-started/");
    this.name = "SemgrepNotFoundError";
  }
}

interface SemgrepRawResult {
  check_id?: string;
  path?: string;
  start?: { line?: number };
  extra?: { message?: string };
}

function runSemgrepProcess(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("semgrep", args, { stdio: ["ignore", "pipe", "pipe"] });
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
        reject(new SemgrepNotFoundError());
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      // semgrep exits 1 when it has findings — that's not a run failure.
      if (code === 0 || code === 1) {
        resolve(stdout);
      } else {
        reject(new Error(`semgrep exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

export function parseSemgrepReport(json: string): Finding[] {
  const trimmed = json.trim();
  if (trimmed.length === 0) return [];

  const raw: unknown = JSON.parse(trimmed);
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { results?: unknown }).results)) {
    return [];
  }

  const findings: Finding[] = [];
  for (const entry of (raw as { results: SemgrepRawResult[] }).results) {
    if (
      typeof entry.path !== "string" ||
      typeof entry.check_id !== "string" ||
      typeof entry.start?.line !== "number"
    ) {
      continue;
    }
    findings.push({
      file: entry.path,
      line: entry.start.line,
      ruleId: entry.check_id.split(".").pop() ?? entry.check_id,
      description: entry.extra?.message?.trim() ?? entry.check_id,
    });
  }
  return findings;
}

export async function findMissingApiAuth(targetDir: string): Promise<Finding[]> {
  const stdout = await runSemgrepProcess([
    "--config",
    RULE_PATH,
    "--json",
    "--quiet",
    targetDir,
  ]);

  return parseSemgrepReport(stdout).map((finding) => ({
    ...finding,
    file: relative(targetDir, resolve(targetDir, finding.file)).split(sep).join("/"),
  }));
}
