import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findExposedFirebaseAdminKeys,
  scanTextForCommittedServiceAccountKey,
  scanTextForPublicFirebaseAdminKey,
} from "../../src/checks/exposedFirebaseAdminKey.js";

const execFileAsync = promisify(execFile);

describe("scanTextForPublicFirebaseAdminKey", () => {
  it("matches a NEXT_PUBLIC_ env var containing FIREBASE_PRIVATE_KEY", () => {
    const matches = scanTextForPublicFirebaseAdminKey("NEXT_PUBLIC_FIREBASE_PRIVATE_KEY=abc");
    expect(matches).toEqual([{ line: 1, variableName: "NEXT_PUBLIC_FIREBASE_PRIVATE_KEY" }]);
  });

  it("matches a NEXT_PUBLIC_ env var containing SERVICE_ACCOUNT", () => {
    const matches = scanTextForPublicFirebaseAdminKey(
      "const x = process.env.NEXT_PUBLIC_FIREBASE_SERVICE_ACCOUNT;"
    );
    expect(matches).toHaveLength(1);
  });

  it("does not match a server-only Firebase admin var", () => {
    expect(scanTextForPublicFirebaseAdminKey("FIREBASE_PRIVATE_KEY=abc")).toEqual([]);
  });

  it("does not match an unrelated NEXT_PUBLIC_ var", () => {
    expect(scanTextForPublicFirebaseAdminKey("NEXT_PUBLIC_FIREBASE_API_KEY=abc")).toEqual([]);
  });
});

describe("scanTextForCommittedServiceAccountKey", () => {
  it("matches a literal service_account type field", () => {
    const content = ["{", '  "type": "service_account",', '  "project_id": "x"', "}"].join("\n");
    expect(scanTextForCommittedServiceAccountKey(content)).toEqual([{ line: 2 }]);
  });

  it("does not match an unrelated type field", () => {
    expect(scanTextForCommittedServiceAccountKey('{"name": "x", "type": "module"}')).toEqual([]);
  });
});

describe("findExposedFirebaseAdminKeys", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-firebase-admin-key-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds a NEXT_PUBLIC_ leak in .env and source files", async () => {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_FIREBASE_PRIVATE_KEY=abc\n");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "firebase.ts"),
      "const key = process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY;\n"
    );

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toHaveLength(2);
    for (const finding of findings) expect(finding.ruleId).toBe("firebase-admin-key-public-env");
  });

  it("finds a committed service account key JSON file", async () => {
    await writeFile(
      join(dir, "serviceAccountKey.json"),
      [
        "{",
        '  "type": "service_account",',
        '  "private_key": "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"',
        "}",
      ].join("\n")
    );

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toEqual([
      {
        file: "serviceAccountKey.json",
        line: 2,
        ruleId: "firebase-service-account-key-committed",
        description: expect.stringContaining("service account key"),
      },
    ]);
  });

  it("returns no findings for a clean project, including a plain package.json", async () => {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_FIREBASE_API_KEY=abc\n");
    await writeFile(join(dir, "package.json"), '{"name": "x", "type": "module"}\n');

    expect(await findExposedFirebaseAdminKeys(dir)).toEqual([]);
  });

  it("ignores node_modules and .next", async () => {
    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(dir, "node_modules", "pkg", "key.json"), '{"type": "service_account"}\n');

    expect(await findExposedFirebaseAdminKeys(dir)).toEqual([]);
  });

  it("notes the .env finding is git-tracked when the file is staged", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".env"), "NEXT_PUBLIC_FIREBASE_PRIVATE_KEY=abc\n");
    await execFileAsync("git", ["add", ".env"], { cwd: dir });

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("ke-track di git");
  });

  it("notes the .env finding is not committed when the file is untracked", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_FIREBASE_PRIVATE_KEY=abc\n");

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("gitignored atau belum ke-commit");
  });

  it("notes the service account key is git-tracked when the file is staged", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, "serviceAccountKey.json"), '{"type": "service_account"}\n');
    await execFileAsync("git", ["add", "serviceAccountKey.json"], { cwd: dir });

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("ke-commit ke repo");
  });

  it("notes the service account key is untracked when the file is not staged", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, "serviceAccountKey.json"), '{"type": "service_account"}\n');

    const findings = await findExposedFirebaseAdminKeys(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("belum ke-track di git");
  });
});
