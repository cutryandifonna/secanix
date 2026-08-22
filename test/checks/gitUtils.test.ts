import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTrackedFiles } from "../../src/checks/gitUtils.js";

const execFileAsync = promisify(execFile);

describe("listTrackedFiles", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-git-utils-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when targetDir is not a git repo", async () => {
    expect(await listTrackedFiles(dir)).toBeNull();
  });

  it("includes a staged file but excludes an untracked one", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, "tracked.env"), "X=1\n");
    await writeFile(join(dir, "untracked.env"), "Y=1\n");
    await execFileAsync("git", ["add", "tracked.env"], { cwd: dir });

    const tracked = await listTrackedFiles(dir);

    expect(tracked?.has("tracked.env")).toBe(true);
    expect(tracked?.has("untracked.env")).toBe(false);
  });
});
