import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findCreatedTables, findRlsDisabledTables } from "../../src/checks/rlsDisabled.js";

describe("findCreatedTables", () => {
  it("matches a plain CREATE TABLE", () => {
    expect(findCreatedTables("create table users (id uuid primary key);")).toEqual([
      { name: "users", line: 1 },
    ]);
  });

  it("matches CREATE TABLE IF NOT EXISTS with schema prefix and quoted identifiers", () => {
    const content = 'create table if not exists "public"."orders" (id uuid primary key);';
    expect(findCreatedTables(content)).toEqual([{ name: "orders", line: 1 }]);
  });

  it("reports correct line numbers across multiple lines", () => {
    const content = ["-- comment", "create table posts (id uuid);", "-- more"].join("\n");
    expect(findCreatedTables(content)).toEqual([{ name: "posts", line: 2 }]);
  });

  it("returns empty array when no CREATE TABLE present", () => {
    expect(findCreatedTables("alter table users enable row level security;")).toEqual([]);
  });
});

describe("findRlsDisabledTables", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-rls-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("flags a table created without any RLS enable statement anywhere", async () => {
    await writeFile(join(dir, "0001_init.sql"), "create table public.notes (id uuid primary key);\n");

    const findings = await findRlsDisabledTables(dir);

    expect(findings).toEqual([
      {
        file: "0001_init.sql",
        line: 1,
        ruleId: "supabase-rls-missing",
        description: expect.stringContaining("notes"),
      },
    ]);
  });

  it("warns that supabase-rls-missing is inferred from migrations only, not live Dashboard state", async () => {
    await writeFile(join(dir, "0001_init.sql"), "create table public.notes (id uuid primary key);\n");

    const [finding] = await findRlsDisabledTables(dir);

    expect(finding.description).toContain("Dashboard");
    expect(finding.description).toContain(".secanix.json");
  });

  it("does not add the Dashboard caveat to the definitive supabase-rls-disabled finding", async () => {
    await writeFile(
      join(dir, "0001_init.sql"),
      [
        "create table public.notes (id uuid primary key);",
        "alter table public.notes enable row level security;",
      ].join("\n")
    );
    await writeFile(join(dir, "0002_oops.sql"), "alter table public.notes disable row level security;\n");

    const [finding] = await findRlsDisabledTables(dir);

    expect(finding.description).not.toContain("Dashboard");
  });

  it("does not flag a table whose RLS is enabled in a later migration file", async () => {
    await writeFile(join(dir, "0001_init.sql"), "create table public.notes (id uuid primary key);\n");
    await writeFile(join(dir, "0002_rls.sql"), "alter table public.notes enable row level security;\n");

    expect(await findRlsDisabledTables(dir)).toEqual([]);
  });

  it("flags a table whose RLS is explicitly disabled even if it was enabled earlier", async () => {
    await writeFile(
      join(dir, "0001_init.sql"),
      [
        "create table public.notes (id uuid primary key);",
        "alter table public.notes enable row level security;",
      ].join("\n")
    );
    await writeFile(join(dir, "0002_oops.sql"), "alter table public.notes disable row level security;\n");

    const findings = await findRlsDisabledTables(dir);

    expect(findings).toEqual([
      {
        file: "0001_init.sql",
        line: 1,
        ruleId: "supabase-rls-disabled",
        description: expect.stringContaining("notes"),
      },
    ]);
  });

  it("ignores non-.sql files and node_modules", async () => {
    await writeFile(join(dir, "notes.md"), "create table public.notes (id uuid primary key);\n");
    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(
      join(dir, "node_modules", "pkg", "seed.sql"),
      "create table vendored (id uuid primary key);\n"
    );

    expect(await findRlsDisabledTables(dir)).toEqual([]);
  });
});
