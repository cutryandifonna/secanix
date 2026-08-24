import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { excludeFindingsAlreadyInWorkingTree, runSecretScanHistory } from "../../src/checks/secretScanHistory.js";

const execFileAsync = promisify(execFile);

// Same fake-secret shape as secretScan.test.ts — matches gitleaks' built-in
// stripe-access-token rule reliably, split across two literals so this file
// doesn't itself trip push-protection.
const FAKE_SECRET = "sk_test_" + "4eC39HqLyjWDarjtT1zdp7dc5m2k9x8vQwErTyU1";

async function initGitRepo(dir: string): Promise<void> {
  await execFileAsync("git", ["init", "-q"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
}

async function commitAll(dir: string, message: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd: dir });
  await execFileAsync("git", ["commit", "-q", "-m", message], { cwd: dir });
}

describe("excludeFindingsAlreadyInWorkingTree", () => {
  it("drops a history finding whose file+ruleId also appears in the working-tree findings", () => {
    const history = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "AWS key (commit abc1234, x)" }];
    const workingTree = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "AWS key" }];

    expect(excludeFindingsAlreadyInWorkingTree(history, workingTree)).toEqual([]);
  });

  it("keeps a history finding that has no matching file+ruleId in the working tree (secret already rotated out)", () => {
    const history = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "AWS key (commit abc1234, x)" }];

    expect(excludeFindingsAlreadyInWorkingTree(history, [])).toEqual(history);
  });

  it("keeps a history finding when only the ruleId differs at the same file", () => {
    const history = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "x" }];
    const workingTree = [{ file: "a.ts", line: 9, ruleId: "generic-api-key", description: "y" }];

    expect(excludeFindingsAlreadyInWorkingTree(history, workingTree)).toEqual(history);
  });

  it("does not collide when file+ruleId concatenation matches across a different file/ruleId split (space in a file path)", () => {
    // Regression: a plain "${file} ${ruleId}" string key isn't collision-safe
    // when a file path contains a space — "src/my key.ts" + "generic-secret"
    // concatenates to the same string as "src/my" + "key.ts generic-secret".
    const history = [{ file: "src/my", line: 1, ruleId: "key.ts generic-secret", description: "x" }];
    const workingTree = [{ file: "src/my key.ts", line: 2, ruleId: "generic-secret", description: "y" }];

    expect(excludeFindingsAlreadyInWorkingTree(history, workingTree)).toEqual(history);
  });

  it("keeps a history finding whose secret differs from the working-tree one at the same file+ruleId", () => {
    // Regression: keyed on file+ruleId alone, a genuinely leaked-and-rotated
    // secret got silently dropped just because a DIFFERENT secret of the same
    // rule type still sits in the same file today — a false negative in
    // exactly the case this check exists to catch.
    const rotated = {
      file: "src/config.ts",
      line: 3,
      ruleId: "aws-access-key",
      description: "AWS key (commit abc1234, x)",
      secretHash: "hash-of-rotated-key",
    };
    const current = {
      file: "src/config.ts",
      line: 9,
      ruleId: "aws-access-key",
      description: "AWS key (commit def5678, y)",
      secretHash: "hash-of-current-key",
    };
    const workingTree = [
      { file: "src/config.ts", line: 9, ruleId: "aws-access-key", description: "AWS key", secretHash: "hash-of-current-key" },
    ];

    expect(excludeFindingsAlreadyInWorkingTree([rotated, current], workingTree)).toEqual([rotated]);
  });

  it("drops a history finding whose secret hash matches the working-tree one", () => {
    const history = [
      { file: "a.ts", line: 5, ruleId: "aws-access-key", description: "x", secretHash: "same-hash" },
    ];
    const workingTree = [
      { file: "a.ts", line: 5, ruleId: "aws-access-key", description: "y", secretHash: "same-hash" },
    ];

    expect(excludeFindingsAlreadyInWorkingTree(history, workingTree)).toEqual([]);
  });

  it("falls back to file+ruleId matching when either side has no secret hash", () => {
    const hashed = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "x", secretHash: "h" }];
    const plain = [{ file: "a.ts", line: 5, ruleId: "aws-access-key", description: "y" }];

    expect(excludeFindingsAlreadyInWorkingTree(hashed, plain)).toEqual([]);
    expect(excludeFindingsAlreadyInWorkingTree(plain, hashed)).toEqual([]);
  });
});

describe("runSecretScanHistory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-secret-scan-history-e2e-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty array when targetDir is not a git repo", async () => {
    await writeFile(join(dir, "config.ts"), `const key = "${FAKE_SECRET}";\n`);

    const findings = await runSecretScanHistory(dir);

    expect(findings).toEqual([]);
  });

  it("finds a secret committed in an earlier commit even after it's removed from the working tree", async () => {
    await initGitRepo(dir);
    await writeFile(join(dir, "config.ts"), `const key = "${FAKE_SECRET}";\n`);
    await commitAll(dir, "add secret");

    await writeFile(join(dir, "config.ts"), "const key = process.env.KEY;\n");
    await commitAll(dir, "remove secret");

    const findings = await runSecretScanHistory(dir);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.description.includes("(commit "))).toBe(true);
  });

  it("scopes findings to targetDir and strips the repo-root prefix when targetDir is a subdirectory of a bigger repo", async () => {
    // Regression: gitleaks --source <subdir> still walks the WHOLE repo's
    // history (git log -p isn't scoped by --source), and reports File
    // relative to the repo root, not targetDir. Without filtering/stripping,
    // this leaks secrets from outside targetDir and returns repo-root-
    // relative paths, breaking the targetDir-relative convention every
    // other check follows.
    await initGitRepo(dir);
    await mkdir(join(dir, "apps", "web"), { recursive: true });
    await writeFile(join(dir, "apps", "web", "config.ts"), `const key = "${FAKE_SECRET}";\n`);
    await writeFile(join(dir, "root-secret.ts"), `const key = "${FAKE_SECRET}";\n`);
    await commitAll(dir, "add secrets in and out of apps/web");

    const findings = await runSecretScanHistory(join(dir, "apps", "web"));

    const files = findings.map((f) => f.file.replace(/\\/g, "/"));
    expect(files).toEqual(["config.ts"]);
  });

  it("returns empty array when no secret was ever committed", async () => {
    await initGitRepo(dir);
    await writeFile(join(dir, "config.ts"), "const key = process.env.KEY;\n");
    await commitAll(dir, "no secret here");

    const findings = await runSecretScanHistory(dir);

    expect(findings).toEqual([]);
  });
});
