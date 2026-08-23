import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("action.yml version pin", () => {
  it("action.yml pins the current package version", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(readFileSync("action.yml", "utf8")).toContain(`secanix@${version}`);
  });
});
