import { readFile } from "node:fs/promises";
import { extname, relative, sep } from "node:path";
import { collectFiles } from "./fsWalk.js";
import type { Finding } from "./types.js";

const CREATE_TABLE_PATTERN = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?\w+"?\.)?"?(\w+)"?/i;
const ENABLE_RLS_PATTERN = /alter\s+table\s+(?:only\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi;
const DISABLE_RLS_PATTERN = /alter\s+table\s+(?:only\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s+disable\s+row\s+level\s+security/gi;

function isSqlFile(filePath: string): boolean {
  return extname(filePath) === ".sql";
}

export interface CreatedTable {
  name: string;
  line: number;
}

// Migrations put one statement per line in practice — scanning line-by-line
// is enough to recover a usable line number without a real SQL parser.
export function findCreatedTables(content: string): CreatedTable[] {
  const tables: CreatedTable[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = CREATE_TABLE_PATTERN.exec(line);
    if (match) tables.push({ name: match[1].toLowerCase(), line: index + 1 });
  });
  return tables;
}

function collectTableNames(content: string, pattern: RegExp): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(pattern)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

// RLS enable/disable statements are often in a different migration file than
// the CREATE TABLE — so this correlates table names across every .sql file
// in the project rather than checking each file in isolation.
export async function findRlsDisabledTables(targetDir: string): Promise<Finding[]> {
  const files = await collectFiles(targetDir, isSqlFile);

  const createdTables: Array<CreatedTable & { file: string }> = [];
  const enabledTables = new Set<string>();
  const disabledTables = new Set<string>();

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relFile = relative(targetDir, file).split(sep).join("/");
    for (const table of findCreatedTables(content)) {
      createdTables.push({ ...table, file: relFile });
    }
    for (const name of collectTableNames(content, ENABLE_RLS_PATTERN)) enabledTables.add(name);
    for (const name of collectTableNames(content, DISABLE_RLS_PATTERN)) disabledTables.add(name);
  }

  const findings: Finding[] = [];
  for (const table of createdTables) {
    if (disabledTables.has(table.name)) {
      findings.push({
        file: table.file,
        line: table.line,
        ruleId: "supabase-rls-disabled",
        description: `Tabel "${table.name}" RLS-nya di-disable eksplisit — data bisa diakses tanpa policy.`,
      });
    } else if (!enabledTables.has(table.name)) {
      findings.push({
        file: table.file,
        line: table.line,
        ruleId: "supabase-rls-missing",
        description: `Tabel "${table.name}" gak ketemu "ENABLE ROW LEVEL SECURITY" di migration manapun — kemungkinan RLS mati.`,
      });
    }
  }

  return findings;
}
