import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const { findMissingApiAuth, parseSemgrepReport } = await import(
  "../../src/checks/apiAuthMissing.js"
);

describe("parseSemgrepReport", () => {
  it("returns empty array for empty report content", () => {
    expect(parseSemgrepReport("")).toEqual([]);
    expect(parseSemgrepReport("   ")).toEqual([]);
  });

  it("returns empty array when results field is missing or not an array", () => {
    expect(parseSemgrepReport("{}")).toEqual([]);
    expect(parseSemgrepReport('{"results":"nope"}')).toEqual([]);
  });

  it("maps valid semgrep results to findings, using the last check_id segment as ruleId", () => {
    const report = JSON.stringify({
      results: [
        {
          check_id: "nextjs-api-auth-missing.nextjs-api-route-missing-auth",
          path: "pages/api/unprotected.ts",
          start: { line: 1 },
          extra: { message: "no auth check found" },
        },
      ],
    });

    expect(parseSemgrepReport(report)).toEqual([
      {
        file: "pages/api/unprotected.ts",
        line: 1,
        ruleId: "nextjs-api-route-missing-auth",
        description: "no auth check found",
      },
    ]);
  });

  it("falls back to check_id as description when message is missing", () => {
    const report = JSON.stringify({
      results: [{ check_id: "rule-id", path: "a.ts", start: { line: 2 } }],
    });

    expect(parseSemgrepReport(report)).toEqual([
      { file: "a.ts", line: 2, ruleId: "rule-id", description: "rule-id" },
    ]);
  });

  it("skips entries missing required fields", () => {
    const report = JSON.stringify({
      results: [
        { path: "a.ts", start: { line: 1 } },
        { check_id: "x", start: { line: 1 } },
        { check_id: "x", path: "a.ts" },
        { check_id: "valid-rule", path: "b.ts", start: { line: 2 } },
      ],
    });

    expect(parseSemgrepReport(report)).toEqual([
      { file: "b.ts", line: 2, ruleId: "valid-rule", description: "valid-rule" },
    ]);
  });
});

function mockSemgrepFinding(finding: {
  check_id: string;
  path: string;
  line: number;
  message: string;
}): void {
  vi.mocked(spawn).mockImplementation(() => {
    const child = new EventEmitter() as unknown as ReturnType<typeof spawn>;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    Object.assign(child, { stdout, stderr });
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            results: [
              {
                check_id: finding.check_id,
                path: finding.path,
                start: { line: finding.line },
                extra: { message: finding.message },
              },
            ],
          })
        )
      );
      child.emit("close", 0);
    });
    return child;
  });
}

describe("findMissingApiAuth", () => {
  afterEach(() => {
    vi.mocked(spawn).mockReset();
  });

  describe("middleware.ts caveat", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "secanix-api-auth-mw-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("appends a middleware caveat when middleware.ts exists at the project root", async () => {
      await writeFile(join(dir, "middleware.ts"), "export function middleware() {}\n");
      mockSemgrepFinding({
        check_id: "nextjs-api-route-missing-auth",
        path: "app/api/admin/route.ts",
        line: 1,
        message: "no auth check found",
      });

      const findings = await findMissingApiAuth(dir);

      expect(findings[0].description).toContain("middleware.ts");
      expect(findings[0].description).toContain(".secanix.json");
    });

    it("appends the caveat for src/middleware.js too", async () => {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "middleware.js"), "export function middleware() {}\n");
      mockSemgrepFinding({
        check_id: "nextjs-api-route-missing-auth",
        path: "app/api/admin/route.ts",
        line: 1,
        message: "no auth check found",
      });

      const findings = await findMissingApiAuth(dir);

      expect(findings[0].description).toContain("middleware.ts");
    });

    it("leaves the description unchanged when no middleware file exists", async () => {
      mockSemgrepFinding({
        check_id: "nextjs-api-route-missing-auth",
        path: "app/api/admin/route.ts",
        line: 1,
        message: "no auth check found",
      });

      const findings = await findMissingApiAuth(dir);

      expect(findings[0].description).toBe("no auth check found");
    });
  });

  it("does not pass --no-git-ignore to semgrep", async () => {
    // Regression test: --no-git-ignore made semgrep walk node_modules/.next,
    // which crashed with a PermissionError on Next.js's .next/dev/lock file
    // in real projects (found by running the CLI against secanix-landing).
    let capturedArgs: string[] = [];
    vi.mocked(spawn).mockImplementation((_cmd, args) => {
      capturedArgs = args as string[];
      const child = new EventEmitter() as unknown as ReturnType<typeof spawn>;
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      Object.assign(child, { stdout, stderr });
      queueMicrotask(() => {
        stdout.emit("data", Buffer.from(JSON.stringify({ results: [] })));
        child.emit("close", 0);
      });
      return child;
    });

    await findMissingApiAuth("/some/target/dir");

    expect(capturedArgs).not.toContain("--no-git-ignore");
  });
});
