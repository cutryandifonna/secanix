#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findMissingApiAuth, SemgrepNotFoundError } from "./checks/apiAuthMissing.js";
import { findCorsWildcard } from "./checks/corsWildcard.js";
import { findDependencyVulnerabilities, OsvScannerNotFoundError } from "./checks/dependencyVulnerabilities.js";
import { findExposedFirebaseAdminKeys } from "./checks/exposedFirebaseAdminKey.js";
import { findExposedServiceRoleKeys } from "./checks/exposedServiceRoleKey.js";
import { findOpenFirebaseRules } from "./checks/firebaseRulesOpen.js";
import { findRlsDisabledTables } from "./checks/rlsDisabled.js";
import { GitleaksNotFoundError, runSecretScan } from "./checks/secretScan.js";
import { applyIgnoreRules, buildReport, formatReport, type CheckFindings, type IgnoreRule } from "./report.js";

const IGNORE_FILE = ".secanix.json";

// Missing file = no suppression (default, zero-friction). Malformed file
// warns and falls back to no suppression rather than crashing the scan.
export async function loadIgnoreRules(targetDir: string): Promise<IgnoreRule[]> {
  let content: string;
  try {
    content = await readFile(join(targetDir, IGNORE_FILE), "utf8");
  } catch {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(content);
    const ignore = (parsed as { ignore?: unknown }).ignore;
    if (!Array.isArray(ignore)) return [];

    const rules: IgnoreRule[] = [];
    for (const entry of ignore as unknown[]) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { file?: unknown }).file === "string" &&
        typeof (entry as { ruleId?: unknown }).ruleId === "string"
      ) {
        const { file, ruleId, reason } = entry as { file: string; ruleId: string; reason?: unknown };
        rules.push({ file, ruleId, reason: typeof reason === "string" ? reason : undefined });
      }
    }
    return rules;
  } catch (err) {
    console.error(`${IGNORE_FILE} invalid, diabaikan: ${(err as Error).message}`);
    return [];
  }
}

export interface RunOptions {
  json?: boolean;
}

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export async function run(targetDir: string = process.cwd(), options: RunOptions = {}): Promise<number> {
  const { json = false } = options;

  if (!json) {
    console.log(`Secanix v${version}`);
  }

  const checkFindings: CheckFindings[] = [];

  try {
    checkFindings.push({ checkId: "secret-scan", findings: await runSecretScan(targetDir) });
  } catch (err) {
    if (err instanceof GitleaksNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  checkFindings.push({
    checkId: "exposed-service-role-key",
    findings: await findExposedServiceRoleKeys(targetDir),
  });

  try {
    checkFindings.push({ checkId: "api-auth-missing", findings: await findMissingApiAuth(targetDir) });
  } catch (err) {
    if (err instanceof SemgrepNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  checkFindings.push({ checkId: "rls-disabled", findings: await findRlsDisabledTables(targetDir) });
  checkFindings.push({ checkId: "cors-wildcard", findings: await findCorsWildcard(targetDir) });
  checkFindings.push({ checkId: "firebase-rules-open", findings: await findOpenFirebaseRules(targetDir) });
  checkFindings.push({
    checkId: "firebase-admin-key-exposed",
    findings: await findExposedFirebaseAdminKeys(targetDir),
  });

  try {
    checkFindings.push({
      checkId: "dependency-cve",
      findings: await findDependencyVulnerabilities(targetDir),
    });
  } catch (err) {
    if (err instanceof OsvScannerNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  const ignoreRules = await loadIgnoreRules(targetDir);
  const { findings: reported, suppressed } = applyIgnoreRules(buildReport(checkFindings), ignoreRules);

  if (suppressed.length > 0) {
    console.error(`${suppressed.length} temuan diabaikan via ${IGNORE_FILE}:`);
    for (const finding of suppressed) {
      const reasonSuffix = finding.reason ? ` (${finding.reason})` : "";
      console.error(`  ${finding.file}:${finding.line} — ${finding.ruleId}${reasonSuffix}`);
    }
  }

  if (json) {
    console.log(JSON.stringify(reported));
  } else {
    for (const line of formatReport(reported)) {
      console.log(line);
    }
  }

  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const targetDir = args.find((arg) => arg !== "--json" && !arg.startsWith("-"));
  process.exit(await run(targetDir, { json }));
}
