import { readFile } from "node:fs/promises";
import { basename, relative, sep } from "node:path";
import { collectFiles } from "./fsWalk.js";
import type { Finding } from "./types.js";

const OPEN_SECURITY_RULE_PATTERN = /allow\s+[\w,\s]+:\s*if\s+true\s*;/i;
const OPEN_DATABASE_JSON_PATTERN = /"\.(?:read|write)"\s*:\s*(?:true|"true")/;

function isFirebaseRulesFile(filePath: string): boolean {
  const name = basename(filePath);
  return name === "firestore.rules" || name === "storage.rules" || name === "database.rules.json";
}

export function findOpenRulesInSecurityRulesText(content: string): Array<{ line: number }> {
  const matches: Array<{ line: number }> = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (OPEN_SECURITY_RULE_PATTERN.test(line)) matches.push({ line: index + 1 });
  });
  return matches;
}

export function findOpenRulesInDatabaseJson(content: string): Array<{ line: number }> {
  const matches: Array<{ line: number }> = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (OPEN_DATABASE_JSON_PATTERN.test(line)) matches.push({ line: index + 1 });
  });
  return matches;
}

export async function findOpenFirebaseRules(targetDir: string): Promise<Finding[]> {
  const files = await collectFiles(targetDir, isFirebaseRulesFile);
  const findings: Finding[] = [];

  for (const file of files) {
    const name = basename(file);
    const content = await readFile(file, "utf8");
    const relFile = relative(targetDir, file).split(sep).join("/");
    const matches =
      name === "database.rules.json"
        ? findOpenRulesInDatabaseJson(content)
        : findOpenRulesInSecurityRulesText(content);

    for (const match of matches) {
      findings.push({
        file: relFile,
        line: match.line,
        ruleId: "firebase-rules-open",
        description: `Rule di "${name}" ngasih akses baca/tulis tanpa syarat (if true / .read atau .write: true) — data bisa diakses siapa aja tanpa auth.`,
      });
    }
  }

  return findings;
}
