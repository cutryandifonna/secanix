#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { findMissingApiAuth, SemgrepNotFoundError } from "./checks/apiAuthMissing.js";
import { findExposedServiceRoleKeys } from "./checks/exposedServiceRoleKey.js";
import { GitleaksNotFoundError, runSecretScan } from "./checks/secretScan.js";
import type { Finding } from "./checks/types.js";

export async function run(targetDir: string = process.cwd()): Promise<number> {
  console.log("Vibe Security Scanner v0.1.0");

  const findings: Finding[] = [];

  try {
    findings.push(...(await runSecretScan(targetDir)));
  } catch (err) {
    if (err instanceof GitleaksNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  findings.push(...(await findExposedServiceRoleKeys(targetDir)));

  try {
    findings.push(...(await findMissingApiAuth(targetDir)));
  } catch (err) {
    if (err instanceof SemgrepNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  if (findings.length === 0) {
    console.log("Nol temuan.");
  } else {
    console.log(`${findings.length} temuan:`);
    for (const finding of findings) {
      console.log(`  ${finding.file}:${finding.line} — ${finding.description} [${finding.ruleId}]`);
    }
  }

  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(await run());
}
