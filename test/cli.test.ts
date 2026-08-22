import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runSecretScan = vi.fn();
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

const { run } = await import("../src/cli.js");
const { GitleaksNotFoundError } = await import("../src/checks/secretScan.js");
const { SemgrepNotFoundError } = await import("../src/checks/apiAuthMissing.js");
const { OsvScannerNotFoundError } = await import("../src/checks/dependencyVulnerabilities.js");

describe("run", () => {
  beforeEach(() => {
    runSecretScan.mockReset();
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
