import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findExposedServiceRoleKeys,
  scanTextForExposedServiceRoleKey,
} from "../../src/checks/exposedServiceRoleKey.js";

const execFileAsync = promisify(execFile);

describe("scanTextForExposedServiceRoleKey", () => {
  it("matches a NEXT_PUBLIC_ env var containing SERVICE_ROLE", () => {
    const matches = scanTextForExposedServiceRoleKey("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc");
    expect(matches).toEqual([{ line: 1, variableName: "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY" }]);
  });

  it("matches a NEXT_PUBLIC_ env var containing SERVICE_KEY", () => {
    const matches = scanTextForExposedServiceRoleKey("const x = process.env.NEXT_PUBLIC_SERVICE_KEY;");
    expect(matches).toHaveLength(1);
  });

  it("does not match a server-only service role key var", () => {
    const matches = scanTextForExposedServiceRoleKey("SUPABASE_SERVICE_ROLE_KEY=abc");
    expect(matches).toEqual([]);
  });

  it("does not match an unrelated NEXT_PUBLIC_ var", () => {
    const matches = scanTextForExposedServiceRoleKey("NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co");
    expect(matches).toEqual([]);
  });

  it("reports correct line numbers across multiple lines", () => {
    const content = ["line one", "NEXT_PUBLIC_X_SERVICE_ROLE_Y=abc", "line three"].join("\n");
    const matches = scanTextForExposedServiceRoleKey(content);
    expect(matches).toEqual([{ line: 2, variableName: "NEXT_PUBLIC_X_SERVICE_ROLE_Y" }]);
  });
});

describe("findExposedServiceRoleKeys", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-exposed-key-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds exposure in .env files and source files, ignores node_modules and .next", async () => {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc\n");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "client.ts"),
      "const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;\n"
    );

    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(
      join(dir, "node_modules", "pkg", "index.js"),
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=should-be-ignored\n"
    );

    await mkdir(join(dir, ".next"), { recursive: true });
    await writeFile(join(dir, ".next", "build.js"), "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=ignored\n");

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file).sort()).toEqual([".env.local", "src/client.ts"]);
    for (const finding of findings) {
      expect(finding.ruleId).toBe("supabase-service-role-key-public-env");
    }
  });

  it("returns no findings for a clean project", async () => {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n");
    await writeFile(join(dir, ".env"), "SUPABASE_SERVICE_ROLE_KEY=server-only-secret\n");

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toEqual([]);
  });

  it("skips non-source, non-env files", async () => {
    await writeFile(join(dir, "notes.md"), "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc\n");
    await writeFile(join(dir, "data.json"), '{"NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY":"abc"}\n');

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toEqual([]);
  });

  it("notes the .env finding is git-tracked when the file is staged", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".env"), "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc\n");
    await execFileAsync("git", ["add", ".env"], { cwd: dir });

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("ke-track di git");
  });

  it("notes the .env finding is not committed when the file is untracked", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc\n");

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("gitignored atau belum ke-commit");
  });

  it("does not add git-tracking context to a source-file finding", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "client.ts"),
      "const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;\n"
    );

    const findings = await findExposedServiceRoleKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).not.toContain("ke-track di git");
    expect(findings[0].description).not.toContain("gitignored atau belum ke-commit");
  });
});
