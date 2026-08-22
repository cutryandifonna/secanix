import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding } from "./types.js";

const MIDDLEWARE_CANDIDATES = [
  "middleware.ts",
  "middleware.js",
  join("src", "middleware.ts"),
  join("src", "middleware.js"),
];

// A route can be protected upstream by middleware.ts instead of an in-handler
// check — this rule only ever sees the handler file, so it can't tell.
// Rather than guess at matcher-pattern coverage (getting that wrong would
// silently hide a genuinely unprotected route), we stay honest about the gap.
const MIDDLEWARE_CAVEAT =
  ' Kalo route ini diproteksi lewat middleware.ts, ini bisa jadi false positive — cek matcher-nya, atau suppress via .secanix.json kalo emang udah aman.';

async function hasMiddlewareFile(targetDir: string): Promise<boolean> {
  const results = await Promise.all(
    MIDDLEWARE_CANDIDATES.map((candidate) =>
      access(join(targetDir, candidate)).then(
        () => true,
        () => false
      )
    )
  );
  return results.some(Boolean);
}

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

  const findings = parseSemgrepReport(stdout).map((finding) => ({
    ...finding,
    file: relative(targetDir, resolve(targetDir, finding.file)).split(sep).join("/"),
  }));

  if (findings.length === 0 || !(await hasMiddlewareFile(targetDir))) return findings;

  return findings.map((finding) => ({ ...finding, description: finding.description + MIDDLEWARE_CAVEAT }));
}
