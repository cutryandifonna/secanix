#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { findMissingApiAuth, SemgrepNotFoundError } from "./checks/apiAuthMissing.js";
import { findCorsWildcard } from "./checks/corsWildcard.js";
import { findDependencyVulnerabilities, OsvScannerNotFoundError } from "./checks/dependencyVulnerabilities.js";
import { findExposedServiceRoleKeys } from "./checks/exposedServiceRoleKey.js";
import { findRlsDisabledTables } from "./checks/rlsDisabled.js";
import { GitleaksNotFoundError, runSecretScan } from "./checks/secretScan.js";
import { buildReport, formatReport, type CheckFindings } from "./report.js";

export interface RunOptions {
  json?: boolean;
}

export async function run(targetDir: string = process.cwd(), options: RunOptions = {}): Promise<number> {
  const { json = false } = options;

  if (!json) {
    console.log("Vibe Security Scanner v0.1.0");
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

  const reported = buildReport(checkFindings);

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
