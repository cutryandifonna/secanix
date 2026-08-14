#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export function run(): number {
  console.log("Vibe Security Scanner v0.1.0 — no checks implemented yet.");
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(run());
}
