import { beforeEach, describe, expect, it, vi } from "vitest";

const runSecretScan = vi.fn();
const findExposedServiceRoleKeys = vi.fn();

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

const { run } = await import("../src/cli.js");
const { GitleaksNotFoundError } = await import("../src/checks/secretScan.js");

describe("run", () => {
  beforeEach(() => {
    runSecretScan.mockReset();
    findExposedServiceRoleKeys.mockReset();
    findExposedServiceRoleKeys.mockResolvedValue([]);
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
});
