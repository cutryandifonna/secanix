import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSecretScanHistory } from "../../src/checks/secretScanHistory.js";

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

  it("returns empty array when no secret was ever committed", async () => {
    await initGitRepo(dir);
    await writeFile(join(dir, "config.ts"), "const key = process.env.KEY;\n");
    await commitAll(dir, "no secret here");

    const findings = await runSecretScanHistory(dir);

    expect(findings).toEqual([]);
  });
});
