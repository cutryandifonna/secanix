#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { GitleaksNotFoundError, runSecretScan } from "./checks/secretScan.js";

export async function run(targetDir: string = process.cwd()): Promise<number> {
  console.log("Vibe Security Scanner v0.1.0");

  try {
    const findings = await runSecretScan(targetDir);
    if (findings.length === 0) {
      console.log("Secret scan: nol temuan.");
    } else {
      console.log(`Secret scan: ${findings.length} temuan.`);
      for (const finding of findings) {
        console.log(`  ${finding.file}:${finding.line} — ${finding.description} [${finding.ruleId}]`);
      }
    }
    return 0;
  } catch (err) {
    if (err instanceof GitleaksNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(await run());
}
