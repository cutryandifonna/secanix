import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import type { Finding } from "./types.js";

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// NEXT_PUBLIC_* env vars get inlined into the client bundle at build time —
// a Supabase service role key under that prefix is a guaranteed leak.
const EXPOSED_KEY_PATTERN = /NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SERVICE_KEY)[A-Z0-9_]*/i;

export interface ExposedKeyMatch {
  line: number;
  variableName: string;
}

export function scanTextForExposedServiceRoleKey(content: string): ExposedKeyMatch[] {
  const matches: ExposedKeyMatch[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = EXPOSED_KEY_PATTERN.exec(line);
    if (match) {
      matches.push({ line: index + 1, variableName: match[0] });
    }
  });
  return matches;
}

function isScannableFile(filePath: string): boolean {
  const name = basename(filePath);
  if (name.startsWith(".env")) return true;
  return SOURCE_EXTENSIONS.has(extname(filePath));
}

async function collectScannableFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...(await collectScannableFiles(fullPath)));
    } else if (entry.isFile() && isScannableFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function findExposedServiceRoleKeys(targetDir: string): Promise<Finding[]> {
  const files = await collectScannableFiles(targetDir);
  const findings: Finding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const match of scanTextForExposedServiceRoleKey(content)) {
      findings.push({
        file: relative(targetDir, file).split(sep).join("/"),
        line: match.line,
        ruleId: "supabase-service-role-key-public-env",
        description: `Env var publik "${match.variableName}" kelihatan nyimpen Supabase service role key — Next.js bakal inline ini ke client bundle.`,
      });
    }
  }

  return findings;
}
