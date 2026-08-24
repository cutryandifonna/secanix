import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runSecretScan = vi.fn();
const runSecretScanHistory = vi.fn();
const findExposedServiceRoleKeys = vi.fn();
const findMissingApiAuth = vi.fn();
const findRlsDisabledTables = vi.fn();
const findCorsWildcard = vi.fn();
const findDependencyVulnerabilities = vi.fn();
const findOpenFirebaseRules = vi.fn();
const findExposedFirebaseAdminKeys = vi.fn();

vi.mock("../src/checks/secretScan.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/secretScan.js")>(
    "../src/checks/secretScan.js"
  );
  return {
    ...actual,
    runSecretScan: (...args: unknown[]) => runSecretScan(...args),
  };
});

vi.mock("../src/checks/secretScanHistory.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/secretScanHistory.js")>(
    "../src/checks/secretScanHistory.js"
  );
  return {
    ...actual,
    runSecretScanHistory: (...args: unknown[]) => runSecretScanHistory(...args),
  };
});

vi.mock("../src/checks/exposedServiceRoleKey.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/exposedServiceRoleKey.js")>(
    "../src/checks/exposedServiceRoleKey.js"
  );
  return {
    ...actual,
    findExposedServiceRoleKeys: (...args: unknown[]) => findExposedServiceRoleKeys(...args),
  };
});

vi.mock("../src/checks/apiAuthMissing.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/apiAuthMissing.js")>(
    "../src/checks/apiAuthMissing.js"
  );
  return {
    ...actual,
    findMissingApiAuth: (...args: unknown[]) => findMissingApiAuth(...args),
  };
});

vi.mock("../src/checks/rlsDisabled.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/rlsDisabled.js")>(
    "../src/checks/rlsDisabled.js"
  );
  return {
    ...actual,
    findRlsDisabledTables: (...args: unknown[]) => findRlsDisabledTables(...args),
  };
});

vi.mock("../src/checks/corsWildcard.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/corsWildcard.js")>(
    "../src/checks/corsWildcard.js"
  );
  return {
    ...actual,
    findCorsWildcard: (...args: unknown[]) => findCorsWildcard(...args),
  };
});

vi.mock("../src/checks/dependencyVulnerabilities.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/dependencyVulnerabilities.js")>(
    "../src/checks/dependencyVulnerabilities.js"
  );
  return {
    ...actual,
    findDependencyVulnerabilities: (...args: unknown[]) => findDependencyVulnerabilities(...args),
  };
});

vi.mock("../src/checks/firebaseRulesOpen.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/firebaseRulesOpen.js")>(
    "../src/checks/firebaseRulesOpen.js"
  );
  return {
    ...actual,
    findOpenFirebaseRules: (...args: unknown[]) => findOpenFirebaseRules(...args),
  };
});

vi.mock("../src/checks/exposedFirebaseAdminKey.js", async () => {
  const actual = await vi.importActual<typeof import("../src/checks/exposedFirebaseAdminKey.js")>(
    "../src/checks/exposedFirebaseAdminKey.js"
  );
  return {
    ...actual,
    findExposedFirebaseAdminKeys: (...args: unknown[]) => findExposedFirebaseAdminKeys(...args),
  };
});

const checkLicense = vi.fn();

vi.mock("../src/licenseCheck.js", () => ({
  checkLicense: (...args: unknown[]) => checkLicense(...args),
}));

const { run, runLicenseCheck } = await import("../src/cli.js");
const { GitleaksNotFoundError } = await import("../src/checks/secretScan.js");
const { SemgrepNotFoundError } = await import("../src/checks/apiAuthMissing.js");
const { OsvScannerNotFoundError } = await import("../src/checks/dependencyVulnerabilities.js");

describe("run", () => {
  beforeEach(() => {
    runSecretScan.mockReset();
    runSecretScanHistory.mockReset();
    runSecretScanHistory.mockResolvedValue([]);
    findExposedServiceRoleKeys.mockReset();
    findExposedServiceRoleKeys.mockResolvedValue([]);
    findMissingApiAuth.mockReset();
    findMissingApiAuth.mockResolvedValue([]);
    findRlsDisabledTables.mockReset();
    findRlsDisabledTables.mockResolvedValue([]);
    findCorsWildcard.mockReset();
    findCorsWildcard.mockResolvedValue([]);
    findDependencyVulnerabilities.mockReset();
    findDependencyVulnerabilities.mockResolvedValue([]);
    findOpenFirebaseRules.mockReset();
    findOpenFirebaseRules.mockResolvedValue([]);
    findExposedFirebaseAdminKeys.mockReset();
    findExposedFirebaseAdminKeys.mockResolvedValue([]);
  });

  it("returns exit code 0 and reports zero findings", async () => {
    runSecretScan.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Nol temuan"));
    logSpy.mockRestore();
  });

  it("returns exit code 0 and prints secret scan findings", async () => {
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("src/db.ts:12"));
    logSpy.mockRestore();
  });

  it("combines findings from both checks in one report", async () => {
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    findExposedServiceRoleKeys.mockResolvedValue([
      {
        file: ".env.local",
        line: 3,
        ruleId: "supabase-service-role-key-public-env",
        description: "exposed",
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("2 temuan"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("src/db.ts:12"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(".env.local:3"));
    logSpy.mockRestore();
  });

  it("does not double-report a secret that's both currently in the working tree and in git history", async () => {
    // Regression: any committed secret is, by definition, also in history —
    // without dedup this would report the same file:line as two separate
    // CRITICAL findings (secret-scan + secret-scan-history).
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    runSecretScanHistory.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key (commit abc1234, x)" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 temuan"));
    logSpy.mockRestore();
  });

  it("still reports a history-only secret that's no longer in the working tree", async () => {
    runSecretScan.mockResolvedValue([]);
    runSecretScanHistory.mockResolvedValue([
      { file: "src/old.ts", line: 3, ruleId: "aws-access-key", description: "AWS Access Key (commit abc1234, x)" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 temuan"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("src/old.ts:3"));
    logSpy.mockRestore();
  });

  it("returns exit code 1 when gitleaks is not installed and skips the second check", async () => {
    runSecretScan.mockRejectedValue(new GitleaksNotFoundError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("gitleaks"));
    expect(findExposedServiceRoleKeys).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rethrows unexpected errors", async () => {
    runSecretScan.mockRejectedValue(new Error("boom"));

    await expect(run("/some/dir")).rejects.toThrow("boom");
  });

  it("returns exit code 1 when gitleaks fails during the history scan", async () => {
    runSecretScan.mockResolvedValue([]);
    runSecretScanHistory.mockRejectedValue(new GitleaksNotFoundError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("gitleaks"));
    expect(findExposedServiceRoleKeys).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rethrows unexpected errors from the history scan", async () => {
    runSecretScan.mockResolvedValue([]);
    runSecretScanHistory.mockRejectedValue(new Error("boom"));

    await expect(run("/some/dir")).rejects.toThrow("boom");
  });

  it("includes missing-api-auth findings in the report", async () => {
    runSecretScan.mockResolvedValue([]);
    findMissingApiAuth.mockResolvedValue([
      {
        file: "pages/api/unprotected.ts",
        line: 1,
        ruleId: "nextjs-api-route-missing-auth",
        description: "no auth check found",
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("pages/api/unprotected.ts:1"));
    logSpy.mockRestore();
  });

  it("includes rls-disabled findings in the report", async () => {
    runSecretScan.mockResolvedValue([]);
    findRlsDisabledTables.mockResolvedValue([
      {
        file: "supabase/migrations/0001_init.sql",
        line: 1,
        ruleId: "supabase-rls-missing",
        description: "RLS missing on notes",
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("supabase/migrations/0001_init.sql:1")
    );
    logSpy.mockRestore();
  });

  it("includes cors-wildcard findings in the report", async () => {
    runSecretScan.mockResolvedValue([]);
    findCorsWildcard.mockResolvedValue([
      {
        file: "pages/api/hello.ts",
        line: 1,
        ruleId: "cors-wildcard-origin",
        description: "CORS wildcard origin",
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("pages/api/hello.ts:1"));
    logSpy.mockRestore();
  });

  it("returns exit code 1 when semgrep is not installed", async () => {
    runSecretScan.mockResolvedValue([]);
    findMissingApiAuth.mockRejectedValue(new SemgrepNotFoundError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("semgrep"));
    errorSpy.mockRestore();
  });

  it("includes dependency-vulnerability findings in the report", async () => {
    runSecretScan.mockResolvedValue([]);
    findDependencyVulnerabilities.mockResolvedValue([
      {
        file: "package-lock.json",
        line: 6,
        ruleId: "GHSA-29mw-wpgm-hmr9",
        description: "lodash@4.17.15 kena kerentanan dikenal",
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("package-lock.json:6"));
    logSpy.mockRestore();
  });

  it("returns exit code 1 when osv-scanner is not installed", async () => {
    runSecretScan.mockResolvedValue([]);
    findDependencyVulnerabilities.mockRejectedValue(new OsvScannerNotFoundError());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await run("/some/dir");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("osv-scanner"));
    errorSpy.mockRestore();
  });

  it("prints JSON output with zero findings and no banner text", async () => {
    runSecretScan.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir", { json: true });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
    logSpy.mockRestore();
  });

  it("prints JSON output with severity and fixSuggestion attached to findings", async () => {
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir", { json: true });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      file: "src/db.ts",
      line: 12,
      ruleId: "aws-access-key",
      severity: "critical",
      fixSuggestion: expect.any(String),
    });
    logSpy.mockRestore();
  });

  it("never leaks the internal secret hash into --json output or the text report", async () => {
    // secretHash exists only to disambiguate dedup between secret-scan and
    // secret-scan-history — it must never reach the user-facing report.
    // Derived, not a hex literal: a hardcoded 64-char hex string in this file
    // trips gitleaks' generic-api-key rule when we dogfood the scanner on
    // our own repo.
    const secretHash = createHash("sha256").update("not-a-real-secret").digest("hex");
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key", secretHash },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await run("/some/dir", { json: true });

    const jsonOutput = logSpy.mock.calls[0][0] as string;
    expect(jsonOutput).not.toContain(secretHash);
    expect(JSON.parse(jsonOutput)[0]).not.toHaveProperty("secretHash");

    logSpy.mockClear();
    await run("/some/dir");

    expect(logSpy.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain(secretHash);
    logSpy.mockRestore();
  });

  describe(".secanix.json ignore rules", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "secanix-cli-ignore-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("suppresses a matching finding and reports it separately on stderr", async () => {
      await writeFile(
        join(dir, ".secanix.json"),
        JSON.stringify({
          ignore: [{ file: "src/db.ts", ruleId: "aws-access-key", reason: "test fixture, not a real key" }],
        })
      );
      runSecretScan.mockResolvedValue([
        { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
      ]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const exitCode = await run(dir, { json: true });

      expect(exitCode).toBe(0);
      expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 temuan diabaikan"));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("test fixture, not a real key"));
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("does not suppress when ruleId matches but file does not", async () => {
      await writeFile(
        join(dir, ".secanix.json"),
        JSON.stringify({ ignore: [{ file: "other/file.ts", ruleId: "aws-access-key" }] })
      );
      runSecretScan.mockResolvedValue([
        { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
      ]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const exitCode = await run(dir, { json: true });

      expect(exitCode).toBe(0);
      expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toHaveLength(1);
      logSpy.mockRestore();
    });

    it("an ignore rule scoped to a checkId does not suppress a different check's finding with the same file+ruleId", async () => {
      // Regression: before checkId-scoping, an ignore rule written for a
      // secret-scan finding would also silently swallow an unrelated
      // secret-scan-history finding that happens to share file+ruleId.
      // Uses a history-only finding (nothing in secret-scan for this
      // file+ruleId) so dedup (excludeFindingsAlreadyInWorkingTree) has
      // nothing to collapse — isolates the checkId-scoping behavior.
      await writeFile(
        join(dir, ".secanix.json"),
        JSON.stringify({ ignore: [{ file: "src/db.ts", ruleId: "aws-access-key", checkId: "secret-scan" }] })
      );
      runSecretScan.mockResolvedValue([]);
      runSecretScanHistory.mockResolvedValue([
        { file: "src/db.ts", line: 40, ruleId: "aws-access-key", description: "AWS Access Key (commit abc1234, x)" },
      ]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const exitCode = await run(dir, { json: true });

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].checkId).toBe("secret-scan-history");
      logSpy.mockRestore();
    });

    it("ignores a malformed .secanix.json, warns, and still runs the scan", async () => {
      await writeFile(join(dir, ".secanix.json"), "{ not valid json");
      runSecretScan.mockResolvedValue([
        { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
      ]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const exitCode = await run(dir, { json: true });

      expect(exitCode).toBe(0);
      expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(".secanix.json"));
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("behaves exactly as before when no .secanix.json is present", async () => {
      runSecretScan.mockResolvedValue([
        { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
      ]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const exitCode = await run(dir, { json: true });

      expect(exitCode).toBe(0);
      expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toHaveLength(1);
      expect(errorSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});

describe("runLicenseCheck", () => {
  beforeEach(() => {
    checkLicense.mockReset();
  });

  it("returns 0 when the license is valid", async () => {
    checkLicense.mockResolvedValue({ status: "valid" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(0);
    expect(checkLicense).toHaveBeenCalledWith("a-key");
    logSpy.mockRestore();
  });

  it("returns 1 and logs the reason when the license is invalid", async () => {
    checkLicense.mockResolvedValue({ status: "invalid", message: "expired" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("expired"));
    errorSpy.mockRestore();
  });

  it("returns 1 when no key is provided", async () => {
    checkLicense.mockResolvedValue({ status: "invalid", message: "missing" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck(undefined);

    expect(exitCode).toBe(1);
    expect(checkLicense).toHaveBeenCalledWith(undefined);
    errorSpy.mockRestore();
  });

  it("returns 2 and logs the reason when the check is inconclusive", async () => {
    checkLicense.mockResolvedValue({ status: "error", message: "timeout" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    errorSpy.mockRestore();
  });
});
