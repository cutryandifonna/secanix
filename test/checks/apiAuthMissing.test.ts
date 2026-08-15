import { describe, expect, it } from "vitest";
import { parseSemgrepReport } from "../../src/checks/apiAuthMissing.js";

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
