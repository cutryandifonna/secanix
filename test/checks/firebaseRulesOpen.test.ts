import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findOpenFirebaseRules,
  findOpenRulesInDatabaseJson,
  findOpenRulesInSecurityRulesText,
} from "../../src/checks/firebaseRulesOpen.js";

describe("findOpenRulesInSecurityRulesText", () => {
  it("matches an explicit allow ... if true rule", () => {
    expect(findOpenRulesInSecurityRulesText("allow read, write: if true;")).toEqual([{ line: 1 }]);
  });

  it("does not match a rule guarded by auth", () => {
    expect(findOpenRulesInSecurityRulesText("allow read, write: if request.auth != null;")).toEqual([]);
  });

  it("reports correct line numbers across multiple lines", () => {
    const content = ["match /docs/{doc} {", "  allow read, write: if true;", "}"].join("\n");
    expect(findOpenRulesInSecurityRulesText(content)).toEqual([{ line: 2 }]);
  });

  it("matches a rule split across multiple lines", () => {
    const content = ["match /docs/{doc} {", "  allow read, write:", "    if true;", "}"].join("\n");
    expect(findOpenRulesInSecurityRulesText(content)).toEqual([{ line: 2 }]);
  });

  it("does not match a multi-line rule guarded by auth", () => {
    const content = ["match /docs/{doc} {", "  allow read, write:", "    if request.auth != null;", "}"].join(
      "\n"
    );
    expect(findOpenRulesInSecurityRulesText(content)).toEqual([]);
  });
});

describe("findOpenRulesInDatabaseJson", () => {
  it("matches .read: true", () => {
    expect(findOpenRulesInDatabaseJson('".read": true')).toEqual([{ line: 1 }]);
  });

  it("matches .write: true", () => {
    expect(findOpenRulesInDatabaseJson('".write": true')).toEqual([{ line: 1 }]);
  });

  it("does not match a .read rule guarded by auth", () => {
    expect(findOpenRulesInDatabaseJson('".read": "auth != null"')).toEqual([]);
  });
});

describe("findOpenFirebaseRules", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vibe-firebase-rules-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("flags an open firestore.rules file", async () => {
    await writeFile(
      join(dir, "firestore.rules"),
      [
        "rules_version = '2';",
        "service cloud.firestore {",
        "  match /{document=**} {",
        "    allow read, write: if true;",
        "  }",
        "}",
      ].join("\n")
    );

    const findings = await findOpenFirebaseRules(dir);

    expect(findings).toEqual([
      {
        file: "firestore.rules",
        line: 4,
        ruleId: "firebase-rules-open",
        description: expect.stringContaining("firestore.rules"),
      },
    ]);
  });

  it("flags an open database.rules.json file", async () => {
    await writeFile(
      join(dir, "database.rules.json"),
      ['{', '  "rules": {', '    ".read": true,', '    ".write": true', "  }", "}"].join("\n")
    );

    const findings = await findOpenFirebaseRules(dir);

    expect(findings).toHaveLength(2);
    for (const finding of findings) expect(finding.ruleId).toBe("firebase-rules-open");
  });

  it("does not flag a locked-down storage.rules file", async () => {
    await writeFile(
      join(dir, "storage.rules"),
      [
        "service firebase.storage {",
        "  match /{allPaths=**} {",
        "    allow read, write: if request.auth != null;",
        "  }",
        "}",
      ].join("\n")
    );

    expect(await findOpenFirebaseRules(dir)).toEqual([]);
  });

  it("ignores unrelated files and node_modules", async () => {
    await writeFile(join(dir, "notes.md"), "allow read, write: if true;\n");
    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(dir, "node_modules", "pkg", "firestore.rules"), "allow read, write: if true;\n");

    expect(await findOpenFirebaseRules(dir)).toEqual([]);
  });
});
