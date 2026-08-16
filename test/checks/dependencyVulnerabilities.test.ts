import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const { findDependencyVulnerabilities, parseOsvReport } = await import(
  "../../src/checks/dependencyVulnerabilities.js"
);

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

describe("findDependencyVulnerabilities", () => {
  let tempRoot: string;
  let targetDir: string;

  beforeEach(async () => {
    // targetDir is a subdirectory, deliberately not process.cwd(), to exercise
    // the absolutePath resolution added in 6af41ca.
    tempRoot = await mkdtemp(join(tmpdir(), "vsc-dep-test-"));
    targetDir = join(tempRoot, "sub");
    await mkdir(targetDir);
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    vi.mocked(spawn).mockReset();
  });

  it("resolves the reported file and line relative to targetDir, not process.cwd()", async () => {
    await writeFile(
      join(targetDir, "package-lock.json"),
      ["{", '  "name": "test-project",', '  "dependencies": {', '    "lodash": "4.17.15"', "  }", "}", ""].join(
        "\n"
      )
    );

    // osv-scanner reports source.path relative to the scanned targetDir, not cwd.
    const osvOutput = JSON.stringify({
      results: [
        {
          source: { path: "package-lock.json" },
          packages: [
            {
              package: { name: "lodash", version: "4.17.15" },
              groups: [{ ids: ["GHSA-29mw-wpgm-hmr9"], aliases: ["CVE-2020-28500"], max_severity: "5.3" }],
            },
          ],
        },
      ],
    });

    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as unknown as ReturnType<typeof spawn>;
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      Object.assign(child, { stdout, stderr });
      queueMicrotask(() => {
        stdout.emit("data", Buffer.from(osvOutput));
        child.emit("close", 0);
      });
      return child;
    });

    const findings = await findDependencyVulnerabilities(targetDir);

    // If the absolutePath fix regressed, readFile would fail against the
    // wrong path, content would come back empty, and line would silently
    // fall back to 1 instead of the package's real line (4).
    expect(findings).toEqual([
      {
        file: "package-lock.json",
        line: 4,
        ruleId: "GHSA-29mw-wpgm-hmr9",
        description: expect.stringContaining("lodash@4.17.15"),
      },
    ]);
  });
});
