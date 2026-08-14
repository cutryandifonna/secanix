import { describe, expect, it } from "vitest";
import { parseGitleaksReport } from "../../src/checks/secretScan.js";

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
