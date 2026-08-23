import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseGitleaksReport, runSecretScan } from "../../src/checks/secretScan.js";

const execFileAsync = promisify(execFile);

// A realistic-shaped fake secret — gitleaks' generic-entropy rules don't
// reliably fire on arbitrary short strings (e.g. "AKIAZZZ..." alone), but
// this Stripe-test-key-shaped value reliably matches the built-in
// stripe-access-token rule. Split across two literals (not one contiguous
// token) and using the test-key prefix so it doesn't itself trip GitHub's
// push-protection secret scanner on this very file.
const FAKE_SECRET = "sk_test_" + "4eC39HqLyjWDarjtT1zdp7dc5m2k9x8vQwErTyU1";

describe("parseGitleaksReport", () => {
  it("returns empty array for empty report content", () => {
    expect(parseGitleaksReport("")).toEqual([]);
    expect(parseGitleaksReport("   ")).toEqual([]);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseGitleaksReport("[]")).toEqual([]);
  });

  it("returns empty array when report is not a JSON array", () => {
    expect(parseGitleaksReport("{}")).toEqual([]);
  });

  it("maps valid gitleaks entries to findings and never leaks the raw secret value", () => {
    const report = JSON.stringify([
      {
        File: "src/db.ts",
        StartLine: 12,
        RuleID: "aws-access-key",
        Description: "AWS Access Key",
        Secret: "AKIA_SUPER_SECRET_VALUE",
        Match: "key = AKIA_SUPER_SECRET_VALUE",
      },
    ]);

    const findings = parseGitleaksReport(report);

    expect(findings).toEqual([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("AKIA_SUPER_SECRET_VALUE");
  });

  it("falls back to ruleId as description when description is missing", () => {
    const report = JSON.stringify([{ File: "a.ts", StartLine: 1, RuleID: "generic-secret" }]);

    expect(parseGitleaksReport(report)).toEqual([
      { file: "a.ts", line: 1, ruleId: "generic-secret", description: "generic-secret" },
    ]);
  });

  it("skips entries missing required fields", () => {
    const report = JSON.stringify([
      { File: "a.ts", StartLine: 1 },
      { StartLine: 1, RuleID: "x" },
      { File: "a.ts", RuleID: "x" },
      { File: "b.ts", StartLine: 2, RuleID: "valid-rule" },
    ]);

    expect(parseGitleaksReport(report)).toEqual([
      { file: "b.ts", line: 2, ruleId: "valid-rule", description: "valid-rule" },
    ]);
  });
});

describe("runSecretScan", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-secret-scan-e2e-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds a real secret in source but ignores the same pattern inside .next/node_modules", async () => {
    // Regression test: gitleaks was invoked with --no-git and no exclude
    // config, so it walked build output/dependencies directly and flagged
    // Next.js's own internal build-cache hashes as "CRITICAL" secrets (found
    // by running the CLI against a real Next.js project, secanix-landing).
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "config.ts"), `const key = "${FAKE_SECRET}";\n`);

    await mkdir(join(dir, ".next", "cache"), { recursive: true });
    await writeFile(join(dir, ".next", "cache", "manifest.json"), `{"hash":"${FAKE_SECRET}"}\n`);

    await mkdir(join(dir, "node_modules", "some-pkg"), { recursive: true });
    await writeFile(
      join(dir, "node_modules", "some-pkg", "index.js"),
      `module.exports.key = "${FAKE_SECRET}";\n`
    );

    const findings = await runSecretScan(dir);

    // Regression: this project isn't a git repo, so no gitignore-filter
    // mirror is built and gitleaks scans targetDir directly — its absolute
    // File path must still get rewritten to targetDir-relative, like every
    // other check, not returned as-is.
    const files = findings.map((f) => f.file.replace(/\\/g, "/"));
    expect(files).toEqual(["src/config.ts"]);
  });

  it("skips files gitignored in the target repo (e.g. .env)", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".gitignore"), ".env\n");
    await writeFile(join(dir, ".env"), `SECRET_KEY=${FAKE_SECRET}\n`);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "config.ts"), `const key = "${FAKE_SECRET}";\n`);

    const findings = await runSecretScan(dir);

    const files = findings.map((f) => f.file.replace(/\\/g, "/"));
    expect(files.some((f) => f.includes("src/config.ts"))).toBe(true);
    expect(files.some((f) => f.includes(".env"))).toBe(false);

    // Regression: findings must be relative to targetDir (matching every
    // other check), not the throwaway gitignore-filter mirror dir that gets
    // deleted after the scan, and not an absolute path either.
    for (const finding of findings) {
      const fileFwd = finding.file.replace(/\\/g, "/");
      expect(fileFwd).toBe("src/config.ts");
    }
  });

  it("still scans .env when it is not gitignored (about to be committed)", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".env"), `SECRET_KEY=${FAKE_SECRET}\n`);

    const findings = await runSecretScan(dir);

    const files = findings.map((f) => f.file.replace(/\\/g, "/"));
    expect(files).toEqual([".env"]);
  });
});
