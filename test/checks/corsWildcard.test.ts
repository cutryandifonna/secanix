import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findCorsWildcard, scanTextForCorsWildcard } from "../../src/checks/corsWildcard.js";

describe("scanTextForCorsWildcard", () => {
  it("matches a manual res.setHeader call with wildcard origin", () => {
    const content = "res.setHeader('Access-Control-Allow-Origin', '*');";
    expect(scanTextForCorsWildcard(content)).toEqual([{ line: 1 }]);
  });

  it("matches an object literal header with wildcard origin", () => {
    const content = "headers: { 'Access-Control-Allow-Origin': '*' }";
    expect(scanTextForCorsWildcard(content)).toEqual([{ line: 1 }]);
  });

  it("matches next.config.js headers() key/value array format across lines", () => {
    const content = [
      "{",
      "  key: 'Access-Control-Allow-Origin',",
      "  value: '*',",
      "}",
    ].join("\n");
    expect(scanTextForCorsWildcard(content)).toEqual([{ line: 2 }]);
  });

  it("matches the cors npm package with wildcard origin config", () => {
    const content = ["app.use(", "  cors({", "    origin: '*',", "  })", ")"].join("\n");
    expect(scanTextForCorsWildcard(content)).toEqual([{ line: 2 }]);
  });

  it("does not match a specific allowed origin", () => {
    const content = "res.setHeader('Access-Control-Allow-Origin', 'https://example.com');";
    expect(scanTextForCorsWildcard(content)).toEqual([]);
  });

  it("does not match cors() with a specific origin function", () => {
    const content = "cors({ origin: 'https://example.com' })";
    expect(scanTextForCorsWildcard(content)).toEqual([]);
  });
});

describe("findCorsWildcard", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-cors-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds wildcard CORS in source files, ignores node_modules", async () => {
    await mkdir(join(dir, "pages", "api"), { recursive: true });
    await writeFile(
      join(dir, "pages", "api", "hello.ts"),
      "res.setHeader('Access-Control-Allow-Origin', '*');\n"
    );

    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(
      join(dir, "node_modules", "pkg", "index.js"),
      "res.setHeader('Access-Control-Allow-Origin', '*');\n"
    );

    const findings = await findCorsWildcard(dir);

    expect(findings).toEqual([
      {
        file: "pages/api/hello.ts",
        line: 1,
        ruleId: "cors-wildcard-origin",
        description: expect.stringContaining("Access-Control-Allow-Origin"),
      },
    ]);
  });

  it("returns no findings for a clean project", async () => {
    await writeFile(
      join(dir, "hello.ts"),
      "res.setHeader('Access-Control-Allow-Origin', 'https://example.com');\n"
    );

    expect(await findCorsWildcard(dir)).toEqual([]);
  });
});
