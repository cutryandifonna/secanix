import { readFile } from "node:fs/promises";
import { extname, relative, sep } from "node:path";
import { collectFiles, SOURCE_EXTENSIONS } from "./fsWalk.js";
import type { Finding } from "./types.js";

// Manual header set: res.setHeader('Access-Control-Allow-Origin', '*'),
// or an object literal { 'Access-Control-Allow-Origin': '*' }.
const DIRECT_HEADER_PATTERN = /access-control-allow-origin['"]?\s*[:,]\s*['"]\*['"]/i;

// next.config.js headers() array format: { key: '...', value: '*' } on
// separate lines — scanned across the whole file, not line-by-line.
const NEXT_CONFIG_HEADER_PATTERN =
  /key\s*:\s*['"]Access-Control-Allow-Origin['"][\s\S]{0,80}?value\s*:\s*['"]\*['"]/gi;

// cors npm package: cors({ origin: '*' }).
const CORS_PACKAGE_PATTERN = /\bcors\s*\(\s*\{[\s\S]{0,200}?origin\s*:\s*['"]\*['"]/gi;

function isScannableFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(filePath));
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

export interface CorsWildcardMatch {
  line: number;
}

export function scanTextForCorsWildcard(content: string): CorsWildcardMatch[] {
  const lines: number[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (DIRECT_HEADER_PATTERN.test(line)) lines.push(index + 1);
  });

  for (const match of content.matchAll(NEXT_CONFIG_HEADER_PATTERN)) {
    lines.push(lineAt(content, match.index));
  }

  for (const match of content.matchAll(CORS_PACKAGE_PATTERN)) {
    lines.push(lineAt(content, match.index));
  }

  return [...new Set(lines)].sort((a, b) => a - b).map((line) => ({ line }));
}

export async function findCorsWildcard(targetDir: string): Promise<Finding[]> {
  const files = await collectFiles(targetDir, isScannableFile);
  const findings: Finding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const match of scanTextForCorsWildcard(content)) {
      findings.push({
        file: relative(targetDir, file).split(sep).join("/"),
        line: match.line,
        ruleId: "cors-wildcard-origin",
        description: 'CORS "Access-Control-Allow-Origin" di-set ke "*" — semua origin bisa akses endpoint ini, termasuk yang jahat.',
      });
    }
  }

  return findings;
}
