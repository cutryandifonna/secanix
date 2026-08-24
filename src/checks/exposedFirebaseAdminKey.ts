import { readFile } from "node:fs/promises";
import { basename, extname, relative, sep } from "node:path";
import { collectFiles, SOURCE_EXTENSIONS } from "./fsWalk.js";
import { envFileTrackingContext, listTrackedFiles } from "./gitUtils.js";
import type { Finding } from "./types.js";

// NEXT_PUBLIC_* env vars get inlined into the client bundle at build time —
// a Firebase Admin SDK key under that prefix is a guaranteed leak.
const PUBLIC_ADMIN_KEY_PATTERN = /NEXT_PUBLIC_[A-Z0-9_]*(?:FIREBASE_PRIVATE_KEY|FIREBASE_ADMIN|SERVICE_ACCOUNT)[A-Z0-9_]*/i;

// The literal downloaded Admin SDK key file always carries this exact field.
// gitleaks' generic PEM detector expects real newlines, not the \n-escaped
// key JSON.stringify produces, so a committed key file slips past secret-scan.
const SERVICE_ACCOUNT_JSON_PATTERN = /"type"\s*:\s*"service_account"/;

// Unlike the .env pattern above (via envFileTrackingContext), a real key
// file's severity doesn't change if it's untracked — leaving a live key
// on disk is already critical. But "hapus dari git history" (report.ts fix
// suggestion) only applies once it's actually in git, so say so accurately.
function serviceAccountTrackingContext(relFile: string, tracked: Set<string> | null): string {
  if (tracked === null) return "";
  return tracked.has(relFile)
    ? " Private key literal ini ke-commit ke repo — hapus juga dari git history, bukan cuma commit baru."
    : " File ini belum ke-track di git — hapus/gitignore sebelum sempet ke-commit, dan tetep rotate key-nya.";
}

function isScannableFile(filePath: string): boolean {
  const name = basename(filePath);
  if (name.startsWith(".env")) return true;
  const ext = extname(filePath);
  return SOURCE_EXTENSIONS.has(ext) || ext === ".json";
}

export function scanTextForPublicFirebaseAdminKey(content: string): Array<{ line: number; variableName: string }> {
  const matches: Array<{ line: number; variableName: string }> = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = PUBLIC_ADMIN_KEY_PATTERN.exec(line);
    if (match) matches.push({ line: index + 1, variableName: match[0] });
  });
  return matches;
}

export function scanTextForCommittedServiceAccountKey(content: string): Array<{ line: number }> {
  const matches: Array<{ line: number }> = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (SERVICE_ACCOUNT_JSON_PATTERN.test(line)) matches.push({ line: index + 1 });
  });
  return matches;
}

export async function findExposedFirebaseAdminKeys(targetDir: string): Promise<Finding[]> {
  const files = await collectFiles(targetDir, isScannableFile);
  const tracked = await listTrackedFiles(targetDir);
  const findings: Finding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relFile = relative(targetDir, file).split(sep).join("/");

    for (const match of scanTextForPublicFirebaseAdminKey(content)) {
      findings.push({
        file: relFile,
        line: match.line,
        ruleId: "firebase-admin-key-public-env",
        description: `Env var publik "${match.variableName}" kelihatan nyimpen Firebase Admin SDK key — Next.js bakal inline ini ke client bundle.${envFileTrackingContext(relFile, tracked)}`,
      });
    }

    for (const match of scanTextForCommittedServiceAccountKey(content)) {
      findings.push({
        file: relFile,
        line: match.line,
        ruleId: "firebase-service-account-key-committed",
        description: `File ini kelihatan kayak service account key JSON asli dari Firebase Admin SDK.${serviceAccountTrackingContext(relFile, tracked)}`,
      });
    }
  }

  return findings;
}
