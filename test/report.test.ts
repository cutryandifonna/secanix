import { describe, expect, it } from "vitest";
import { applyIgnoreRules, buildReport, classify, formatReport } from "../src/report.js";

const finding = (overrides: Partial<{ file: string; line: number; ruleId: string; description: string }>) => ({
  file: "a.ts",
  line: 1,
  ruleId: "some-rule",
  description: "some description",
  ...overrides,
});

describe("classify", () => {
  it("maps a known static ruleId to its fixed severity and fix suggestion", () => {
    const result = classify(finding({ ruleId: "cors-wildcard-origin" }), "cors-wildcard");
    expect(result.severity).toBe("medium");
    expect(result.fixSuggestion).toContain("origin");
  });

  it("classifies supabase-rls-disabled as critical", () => {
    expect(classify(finding({ ruleId: "supabase-rls-disabled" }), "rls-disabled").severity).toBe("critical");
  });

  it("classifies any secret-scan finding as critical regardless of gitleaks ruleId", () => {
    const result = classify(finding({ ruleId: "aws-access-key" }), "secret-scan");
    expect(result.severity).toBe("critical");
    expect(result.fixSuggestion).toContain("rotate");
  });

  it("derives dependency-cve severity from the embedded CVSS score", () => {
    expect(classify(finding({ description: "x@1 kena kerentanan (severity 9.5)." }), "dependency-cve").severity).toBe(
      "critical"
    );
    expect(classify(finding({ description: "x@1 kena kerentanan (severity 7.0)." }), "dependency-cve").severity).toBe(
      "high"
    );
    expect(classify(finding({ description: "x@1 kena kerentanan (severity 4.0)." }), "dependency-cve").severity).toBe(
      "medium"
    );
    expect(classify(finding({ description: "x@1 kena kerentanan (severity 3.9)." }), "dependency-cve").severity).toBe(
      "low"
    );
  });

  it("falls back to high for dependency-cve findings with no parseable severity", () => {
    expect(classify(finding({ description: "no score here" }), "dependency-cve").severity).toBe("high");
  });

  it("falls back to medium with a generic fix for an unrecognized ruleId/checkId", () => {
    const result = classify(finding({ ruleId: "totally-unknown" }), "some-other-check");
    expect(result.severity).toBe("medium");
    expect(result.fixSuggestion).toContain("manual");
  });
});

describe("buildReport", () => {
  it("sorts findings by severity: critical, high, medium, low", () => {
    const report = buildReport([
      { checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin", file: "medium.ts" })] },
      {
        checkId: "rls-disabled",
        findings: [finding({ ruleId: "supabase-rls-disabled", file: "critical.ts" })],
      },
      {
        checkId: "rls-disabled",
        findings: [finding({ ruleId: "supabase-rls-missing", file: "high.ts" })],
      },
    ]);

    expect(report.map((f) => f.file)).toEqual(["critical.ts", "high.ts", "medium.ts"]);
  });
});

describe("applyIgnoreRules", () => {
  it("passes every finding through when there are no ignore rules", () => {
    const reported = buildReport([{ checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin" })] }]);

    const result = applyIgnoreRules(reported, []);

    expect(result.findings).toEqual(reported);
    expect(result.suppressed).toEqual([]);
  });

  it("moves a finding matching file+ruleId into suppressed, carrying the ignore reason", () => {
    const reported = buildReport([
      { checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin", file: "a.ts" })] },
    ]);

    const result = applyIgnoreRules(reported, [
      { file: "a.ts", ruleId: "cors-wildcard-origin", reason: "internal admin tool, origin locked by proxy" },
    ]);

    expect(result.findings).toEqual([]);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0]).toMatchObject({
      file: "a.ts",
      ruleId: "cors-wildcard-origin",
      reason: "internal admin tool, origin locked by proxy",
    });
  });

  it("requires both file and ruleId to match — same ruleId in a different file stays active", () => {
    const reported = buildReport([
      { checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin", file: "b.ts" })] },
    ]);

    const result = applyIgnoreRules(reported, [{ file: "a.ts", ruleId: "cors-wildcard-origin" }]);

    expect(result.findings).toHaveLength(1);
    expect(result.suppressed).toEqual([]);
  });
});

describe("formatReport", () => {
  it("returns a single line for zero findings", () => {
    expect(formatReport([])).toEqual(["Nol temuan."]);
  });

  it("groups findings under a severity header with a count and includes the fix suggestion per line", () => {
    const report = buildReport([
      { checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin", file: "a.ts", line: 5 })] },
    ]);

    const lines = formatReport(report);

    expect(lines[0]).toBe("1 temuan:");
    expect(lines[1]).toBe("[MEDIUM] (1)");
    expect(lines[2]).toContain("a.ts:5");
    expect(lines[2]).toContain("Fix:");
  });

  it("skips severity headers with no findings", () => {
    const report = buildReport([
      { checkId: "cors-wildcard", findings: [finding({ ruleId: "cors-wildcard-origin" })] },
    ]);

    const lines = formatReport(report);

    expect(lines.some((line) => line.startsWith("[CRITICAL]"))).toBe(false);
    expect(lines.some((line) => line.startsWith("[MEDIUM]"))).toBe(true);
  });
});
