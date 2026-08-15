import { describe, expect, it } from "vitest";
import { parseOsvReport } from "../../src/checks/dependencyVulnerabilities.js";

describe("parseOsvReport", () => {
  it("returns empty array for empty report content", () => {
    expect(parseOsvReport("")).toEqual([]);
    expect(parseOsvReport("   ")).toEqual([]);
  });

  it("returns empty array when results field is missing or not an array", () => {
    expect(parseOsvReport("{}")).toEqual([]);
    expect(parseOsvReport('{"results":"nope"}')).toEqual([]);
  });

  it("maps a vulnerable package group to a finding", () => {
    const report = JSON.stringify({
      results: [
        {
          source: { path: "/proj/package-lock.json" },
          packages: [
            {
              package: { name: "lodash", version: "4.17.15", ecosystem: "npm" },
              groups: [
                {
                  ids: ["GHSA-29mw-wpgm-hmr9"],
                  aliases: ["CVE-2020-28500", "GHSA-29mw-wpgm-hmr9"],
                  max_severity: "5.3",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parseOsvReport(report)).toEqual([
      {
        file: "/proj/package-lock.json",
        packageName: "lodash",
        ruleId: "GHSA-29mw-wpgm-hmr9",
        description: expect.stringContaining("lodash@4.17.15"),
      },
    ]);
  });

  it("emits one finding per group when a package has multiple vulnerability groups", () => {
    const report = JSON.stringify({
      results: [
        {
          source: { path: "a/package-lock.json" },
          packages: [
            {
              package: { name: "x", version: "1.0.0" },
              groups: [{ ids: ["GHSA-1"] }, { ids: ["GHSA-2"] }],
            },
          ],
        },
      ],
    });

    const findings = parseOsvReport(report);
    expect(findings.map((f) => f.ruleId)).toEqual(["GHSA-1", "GHSA-2"]);
  });

  it("skips entries missing required fields", () => {
    const report = JSON.stringify({
      results: [
        { packages: [{ package: { name: "x", version: "1.0.0" }, groups: [{ ids: ["GHSA-1"] }] }] },
        { source: { path: "a.json" }, packages: [{ package: { name: "x" }, groups: [{ ids: ["GHSA-1"] }] }] },
        { source: { path: "a.json" }, packages: [{ package: { name: "x", version: "1.0.0" }, groups: [{}] }] },
        {
          source: { path: "b.json" },
          packages: [{ package: { name: "ok", version: "1.0.0" }, groups: [{ ids: ["GHSA-ok"] }] }],
        },
      ],
    });

    expect(parseOsvReport(report)).toEqual([
      {
        file: "b.json",
        packageName: "ok",
        ruleId: "GHSA-ok",
        description: expect.stringContaining("ok@1.0.0"),
      },
    ]);
  });
});
