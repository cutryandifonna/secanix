# License-key verification (Pro tier gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the customer-facing `action.yml` (Pro tier) behind a LemonSqueezy license-key check — valid key runs the scan as today, invalid/missing key stops the job before any scanner installs, and a LemonSqueezy outage doesn't block the customer's CI.

**Architecture:** A new pure module (`src/licenseCheck.ts`) calls LemonSqueezy's public `POST /v1/licenses/validate` endpoint and returns one of `valid` / `invalid` / `error`. A new CLI subcommand (`secanix license-check`) wraps it with process exit codes 0/1/2. `action.yml` runs that subcommand as its first real step (right after installing the CLI itself, before installing gitleaks/semgrep/osv-scanner) and lets normal step-failure propagation do the fail-closed job stop; the fail-open path for exit code 2 is handled inside the step's own shell script by converting it back to exit 0 with a warning annotation.

**Tech Stack:** TypeScript CLI (existing), Node 18+ global `fetch`/`AbortSignal.timeout` (no new dependency), vitest (existing), GitHub Actions composite syntax (existing `action.yml`), LemonSqueezy License API.

**Spec:** `docs/superpowers/specs/2026-08-22-license-key-verification-design.md`

## Global Constraints

- Free CLI (`npx secanix`) is untouched by this work — no license check anywhere in `run()` or the check pipeline. Only the composite Action is gated.
- Validation uses `POST https://api.lemonsqueezy.com/v1/licenses/validate` only — no `/activate`, no instance/seat tracking, no Store API key anywhere in this code.
- Env var / input name is `SECANIX_LICENSE_KEY` (repo secret name customers create) — never `LEMONSQUEEZY_LICENSE_KEY`.
- Exit code contract for `secanix license-check`: `0` = valid, `1` = invalid or missing key (fail-closed), `2` = LemonSqueezy unreachable/malformed response (fail-open, caller must convert back to success).
- Composite actions do not inherit the calling workflow's `secrets` context automatically — the license key must be declared as an `action.yml` `inputs:` field and passed explicitly by the customer via `with: license-key: ${{ secrets.SECANIX_LICENSE_KEY }}` in their own workflow.
- `npm publish` requires a real, separate terminal window outside Claude Code for the browser OTP step (documented friction from prior sessions) — the controller cannot complete this step itself.

---

### Task 1: `src/licenseCheck.ts` — pure LemonSqueezy validation

**Files:**
- Create: `src/licenseCheck.ts`
- Test: `test/licenseCheck.test.ts`

**Interfaces:**
- Produces: `export type LicenseCheckResult = { status: "valid" } | { status: "invalid"; message: string } | { status: "error"; message: string }` and `export async function checkLicense(key: string | undefined): Promise<LicenseCheckResult>`. Task 2 imports both from `./licenseCheck.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/licenseCheck.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLicense } from "../src/licenseCheck.js";

describe("checkLicense", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns invalid without calling fetch when the key is undefined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkLicense(undefined);

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns invalid without calling fetch when the key is an empty string", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkLicense("");

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns valid when LemonSqueezy responds with valid: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ valid: true }) })
    );

    const result = await checkLicense("real-key");

    expect(result).toEqual({ status: "valid" });
  });

  it("returns invalid with LemonSqueezy's own error message when valid is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ valid: false, error: "license_key_not_found" }),
      })
    );

    const result = await checkLicense("wrong-key");

    expect(result).toEqual({ status: "invalid", message: "license_key_not_found" });
  });

  it("returns invalid with a default message when valid is false and no error string is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ valid: false }) })
    );

    const result = await checkLicense("wrong-key");

    expect(result).toEqual({ status: "invalid", message: expect.any(String) });
  });

  it("returns error when fetch throws (network failure or timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
    expect((result as { message: string }).message).toContain("fetch failed");
  });

  it("returns error when the response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })
    );

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
  });

  it("returns error when the response body has no 'valid' field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ unexpected: "shape" }) })
    );

    const result = await checkLicense("any-key");

    expect(result.status).toBe("error");
  });

  it("POSTs the license key as form-encoded body to the validate endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ valid: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await checkLicense("my-key");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as URLSearchParams;
    expect(body.get("license_key")).toBe("my-key");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/licenseCheck.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/licenseCheck.ts`:

```ts
const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const REQUEST_TIMEOUT_MS = 10_000;

export type LicenseCheckResult =
  | { status: "valid" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export async function checkLicense(key: string | undefined): Promise<LicenseCheckResult> {
  if (!key) {
    return { status: "invalid", message: "SECANIX_LICENSE_KEY is missing or empty." };
  }

  let response: { json: () => Promise<unknown> };
  try {
    response = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({ license_key: key }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return { status: "error", message: `Could not reach LemonSqueezy: ${(err as Error).message}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "LemonSqueezy returned a non-JSON response." };
  }

  if (typeof body !== "object" || body === null || !("valid" in body)) {
    return { status: "error", message: "Unexpected response shape from LemonSqueezy." };
  }

  const { valid, error } = body as { valid?: unknown; error?: unknown };

  if (valid === true) {
    return { status: "valid" };
  }

  return {
    status: "invalid",
    message: typeof error === "string" ? error : "License key is invalid or expired.",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all `checkLicense` tests PASS, all pre-existing tests still PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms `fetch`/`AbortSignal`/`URLSearchParams` globals resolve under the current `@types/node` version).

- [ ] **Step 6: Commit**

```bash
git add src/licenseCheck.ts test/licenseCheck.test.ts
git commit -m "feat: add LemonSqueezy license validation module"
```

---

### Task 2: CLI `license-check` subcommand

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**
- Consumes: `checkLicense(key: string | undefined): Promise<LicenseCheckResult>` from Task 1 (`./licenseCheck.js`).
- Produces: `export async function runLicenseCheck(key: string | undefined): Promise<number>` (0/1/2 per the Global Constraints exit-code contract) and argv dispatch so `node dist/cli.js license-check` reads `process.env.SECANIX_LICENSE_KEY` and exits with that code. Task 4 (`action.yml`) invokes this exact CLI path.

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.ts`, near the top alongside the other `vi.mock(...)` calls (before the `const { run } = await import("../src/cli.js");` line):

```ts
const checkLicense = vi.fn();

vi.mock("../src/licenseCheck.js", () => ({
  checkLicense: (...args: unknown[]) => checkLicense(...args),
}));
```

Change the existing import line:

```ts
const { run } = await import("../src/cli.js");
```

to:

```ts
const { run, runLicenseCheck } = await import("../src/cli.js");
```

Add a new `describe` block after the existing `describe("run", ...)` block closes (after its final `});`, still before end of file):

```ts
describe("runLicenseCheck", () => {
  beforeEach(() => {
    checkLicense.mockReset();
  });

  it("returns 0 when the license is valid", async () => {
    checkLicense.mockResolvedValue({ status: "valid" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(0);
    expect(checkLicense).toHaveBeenCalledWith("a-key");
    logSpy.mockRestore();
  });

  it("returns 1 and logs the reason when the license is invalid", async () => {
    checkLicense.mockResolvedValue({ status: "invalid", message: "expired" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("expired"));
    errorSpy.mockRestore();
  });

  it("returns 1 when no key is provided", async () => {
    checkLicense.mockResolvedValue({ status: "invalid", message: "missing" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck(undefined);

    expect(exitCode).toBe(1);
    expect(checkLicense).toHaveBeenCalledWith(undefined);
    errorSpy.mockRestore();
  });

  it("returns 2 and logs the reason when the check is inconclusive", async () => {
    checkLicense.mockResolvedValue({ status: "error", message: "timeout" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runLicenseCheck("a-key");

    expect(exitCode).toBe(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `runLicenseCheck` is not exported from `src/cli.ts`.

- [ ] **Step 3: Implement in `src/cli.ts`**

Add the import (alongside the existing check imports near the top):

```ts
import { checkLicense } from "./licenseCheck.js";
```

Add the new exported function (after `run(...)`'s closing brace, before the `isMain` block):

```ts
export async function runLicenseCheck(key: string | undefined): Promise<number> {
  const result = await checkLicense(key);

  if (result.status === "valid") {
    console.log("secanix Pro license valid.");
    return 0;
  }

  if (result.status === "invalid") {
    console.error(`secanix Pro license invalid: ${result.message}`);
    return 1;
  }

  console.error(`secanix Pro license check inconclusive: ${result.message}`);
  return 2;
}
```

Replace the `isMain` block:

```ts
const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);

  if (args[0] === "license-check") {
    process.exit(await runLicenseCheck(process.env.SECANIX_LICENSE_KEY));
  } else {
    const json = args.includes("--json");
    const targetDir = args.find((arg) => arg !== "--json" && !arg.startsWith("-"));
    process.exit(await run(targetDir, { json }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, including the new `runLicenseCheck` suite and every pre-existing test.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: succeeds, `dist/cli.js` produced.

- [ ] **Step 6: Real run — verify the subcommand end to end**

Run: `SECANIX_LICENSE_KEY= node dist/cli.js license-check; echo "exit: $?"`
Expected: prints `secanix Pro license invalid: SECANIX_LICENSE_KEY is missing or empty.` to stderr, `exit: 1`.

Run: `SECANIX_LICENSE_KEY=obviously-fake-key node dist/cli.js license-check; echo "exit: $?"`
Expected: reaches the real LemonSqueezy API (no mocking at this layer), prints an invalid message, `exit: 1`. This confirms the real network call works, independent of having a real key yet.

Run: `node dist/cli.js .` (no arguments)
Expected: unchanged full-scan behavior — regression check that the subcommand dispatch didn't break the default path.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add 'license-check' CLI subcommand"
```

---

### Task 3: Version bump, real test-mode verification, npm publish

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2's `license-check` subcommand (already built into `dist/`).
- Produces: `secanix@0.1.4` published on the public npm registry, containing the `license-check` subcommand. Task 4's `action.yml` pins this version.

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "0.1.3",
```

to:

```json
  "version": "0.1.4",
```

- [ ] **Step 2: Full verification pass**

Run: `npm run typecheck && npm test && npm run build`
Expected: all three succeed, same as Tasks 1–2's individual checks (this is the combined pre-publish gate).

- [ ] **Step 3: STOP — get a LemonSqueezy test-mode license key from the user**

This subcommand has only been verified against invalid/fake keys so far (Task 2, Step 6). Before publishing, verify it correctly reports `valid` for a real key. Ask the user to either:
- Paste a LemonSqueezy **test-mode** license key directly (acceptable — test-mode keys aren't linked to real payments), or
- Run the verification command themselves in their own terminal and report back the exit code, if they'd rather not paste the key into this session.

Do not proceed to Step 4 without one of these.

- [ ] **Step 4: Verify against a real (test-mode) key**

Run: `SECANIX_LICENSE_KEY=<test-mode key> node dist/cli.js license-check; echo "exit: $?"`
Expected: `secanix Pro license valid.`, `exit: 0`.

If this fails, STOP and debug — do not publish a version whose license-check has never actually returned `valid` against a real LemonSqueezy response.

- [ ] **Step 5: Dogfood — run the full CLI against this repo**

Run: `node dist/cli.js .`
Expected: zero `CRITICAL` findings (consistent with every prior release's pre-publish check).

- [ ] **Step 6: Commit the version bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.4 for license-check subcommand"
```

- [ ] **Step 7: STOP — confirm before publishing**

`npm publish` is effectively irreversible. Confirm explicitly with the user before running it.

- [ ] **Step 8: Publish**

Tell the user to run `npm publish` themselves in a terminal window fully outside Claude Code (per this project's established npm-OTP friction — the redacted auth URL through the Bash tool or the `!` bridge is not enough to complete the browser approval). Wait for confirmation it succeeded.

- [ ] **Step 9: Verify the published package**

Run: `npx -p secanix@latest secanix license-check` — this should fail with "missing key" (no `SECANIX_LICENSE_KEY` set), confirming the subcommand is present and reachable in the published package, not just local `dist/`.

---

### Task 4: `action.yml` license gate + README

**Files:**
- Modify: `action.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: published `secanix@0.1.4` (Task 3), specifically `node .../dist/cli.js license-check` with `SECANIX_LICENSE_KEY` in its environment, exit codes 0/1/2 per the Global Constraints.
- Produces: `action.yml` with a new required-in-practice `license-key` input, gating the existing scan+comment steps.

- [ ] **Step 1: Rewrite `action.yml`**

Replace the whole file with:

```yaml
name: "Secanix"
description: "Scan Next.js/Supabase apps for leaked secrets, missing API auth, disabled RLS, CORS wildcards, and vulnerable dependencies."
inputs:
  working-directory:
    description: "Directory to scan, relative to the repo root."
    required: false
    default: "."
  license-key:
    description: "Secanix Pro license key (from LemonSqueezy). Pass as license-key: ${{ secrets.SECANIX_LICENSE_KEY }}."
    required: false
    default: ""
runs:
  using: "composite"
  steps:
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20

    - name: Install secanix CLI
      shell: bash
      run: npm install --no-save --prefix "$RUNNER_TEMP/secanix-install" secanix@0.1.4

    - name: Check Pro license
      shell: bash
      env:
        SECANIX_LICENSE_KEY: ${{ inputs.license-key }}
      run: |
        # GitHub Actions runs `shell: bash` steps with `-e`, which would abort
        # this script the instant `node ...` exits non-zero — before the next
        # line could read $?. The if/else below captures the real exit code
        # without tripping that.
        if node "$RUNNER_TEMP/secanix-install/node_modules/secanix/dist/cli.js" license-check; then
          code=0
        else
          code=$?
        fi

        if [ "$code" -eq 0 ]; then
          exit 0
        elif [ "$code" -eq 2 ]; then
          echo "::warning::Could not verify secanix Pro license (LemonSqueezy unreachable) — continuing scan."
          exit 0
        else
          echo "::error::secanix Pro license invalid or missing. Subscribe at secanix.com/pricing and pass license-key: \${{ secrets.SECANIX_LICENSE_KEY }} to this action."
          exit 1
        fi

    - name: Install gitleaks
      shell: bash
      run: |
        curl -sSfL -o "$RUNNER_TEMP/gitleaks.tar.gz" https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
        tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks
        sudo mv "$RUNNER_TEMP/gitleaks" /usr/local/bin/gitleaks

    - name: Install semgrep
      shell: bash
      run: pip install semgrep==1.173.0

    - name: Install osv-scanner
      shell: bash
      run: |
        sudo curl -sSfL -o /usr/local/bin/osv-scanner https://github.com/google/osv-scanner/releases/download/v2.5.0/osv-scanner_linux_amd64
        sudo chmod +x /usr/local/bin/osv-scanner

    - name: Run secanix
      shell: bash
      env:
        WORKING_DIRECTORY: ${{ inputs.working-directory }}
      run: |
        node "$RUNNER_TEMP/secanix-install/node_modules/secanix/dist/cli.js" --json "$WORKING_DIRECTORY" > "$RUNNER_TEMP/secanix-report.json"

    - name: Report results
      uses: actions/github-script@v7
      env:
        WORKING_DIRECTORY: ${{ inputs.working-directory }}
      with:
        script: |
          const fs = require('fs');
          const path = require('path');

          const reportPath = path.join(process.env.RUNNER_TEMP, 'secanix-report.json');
          const reportContent = fs.readFileSync(reportPath, 'utf8');
          if (reportContent.trim().length === 0) {
            throw new Error('scanner produced no output — check the previous step\'s logs');
          }
          const findings = JSON.parse(reportContent);

          const severityOrder = ['critical', 'high', 'medium', 'low'];
          const severityLabel = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
          const severityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

          const counts = { critical: 0, high: 0, medium: 0, low: 0 };
          for (const finding of findings) {
            counts[finding.severity]++;
          }

          const marker = '<!-- secanix-report -->';
          const lines = [marker, '## Secanix'];
          const workingDirectory = process.env.WORKING_DIRECTORY;

          if (findings.length === 0) {
            lines.push('Nol temuan.');
          } else {
            const summary = severityOrder
              .filter((s) => counts[s] > 0)
              .map((s) => `${severityEmoji[s]} ${counts[s]} ${severityLabel[s]}`)
              .join(', ');
            lines.push(`**${findings.length} temuan** — ${summary}`);

            for (const severity of severityOrder) {
              const group = findings.filter((f) => f.severity === severity);
              if (group.length === 0) continue;
              lines.push('', `### ${severityEmoji[severity]} ${severityLabel[severity]} (${group.length})`);
              for (const finding of group) {
                const filePath =
                  workingDirectory && workingDirectory !== '.'
                    ? `${workingDirectory}/${finding.file}`
                    : finding.file;
                lines.push(`- \`${filePath}:${finding.line}\` — ${finding.description}`);
                lines.push(`  - Fix: ${finding.fixSuggestion}`);
              }
            }
          }

          const body = lines.join('\n');

          if (context.eventName === 'pull_request') {
            try {
              const { owner, repo } = context.repo;
              const issue_number = context.payload.pull_request.number;

              const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number });
              const existing = comments.find((c) => c.body?.includes(marker));

              if (existing) {
                await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
              } else {
                await github.rest.issues.createComment({ owner, repo, issue_number, body });
              }
            } catch (err) {
              core.warning(`Could not post PR comment — likely a fork PR with a read-only GITHUB_TOKEN: ${err.message}`);
            }
          }

          if (counts.critical > 0) {
            core.setFailed(`${counts.critical} critical finding(s) found`);
          }
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8')); print('valid')"`
Expected: `valid` printed, no exception.

- [ ] **Step 3: Update `README.md`'s GitHub Action section**

Replace the `## GitHub Action` section with:

```markdown
## GitHub Action

Requires a Secanix Pro subscription. Add to `.github/workflows/security-scan.yml` in your repo:

```yaml
name: Security Scan
on: pull_request
permissions:
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cutryandifonna/secanix@v1
        with:
          license-key: ${{ secrets.SECANIX_LICENSE_KEY }}
```

Get a license key by subscribing at [secanix.com/pricing](https://secanix.com/pricing), then add it as a repository secret named `SECANIX_LICENSE_KEY`. Without a valid key, the job stops before any scan runs.

The action fails CI when a critical finding is present (leaked secret, exposed Supabase service role key, or RLS disabled). It posts and updates a single PR comment listing all findings by severity. This requires the consuming workflow to grant `permissions: pull-requests: write` itself, as shown above — without it, comment posting fails with a 403. GitHub-hosted `ubuntu-latest` runners (uses `sudo` for tool installs — self-hosted runners need equivalent permissions).
```

- [ ] **Step 4: Commit**

```bash
git add action.yml README.md
git commit -m "feat: gate GitHub Action behind LemonSqueezy Pro license check"
```

---

### Task 5: End-to-end validation on a real PR

**Files:**
- Create (temporary, reverted at the end): a scratch branch/workflow that exercises the tagged action.

**Interfaces:**
- Consumes: `action.yml` from Task 4, tagged as `v1` (see Step 1 below).
- Produces: no permanent code change — confidence that the license gate actually works against the real GitHub Actions runner and the real LemonSqueezy API, not mocks.

- [ ] **Step 1: Move the `v1` tag to the new commit**

```bash
git push origin master
git tag -f v1 $(git rev-parse HEAD)
git push origin v1 --force
```

This retags `v1` the same way the earlier `0.1.2` → `0.1.3` drift fix did (see `project_mvp_progress` memory) — confirm with the user before the `--force` push, since it's a force-push even though it's the established convention for this repo's Action major-version tag.

- [ ] **Step 2: Create a scratch branch with a workflow using the tagged action**

```bash
git checkout -b test/license-gate-e2e
```

Create `.github/workflows/e2e-license-test.yml`:

```yaml
name: E2E License Gate Test
on: pull_request
permissions:
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cutryandifonna/secanix@v1
        with:
          license-key: ${{ secrets.SECANIX_TEST_LICENSE_KEY }}
```

- [ ] **Step 3: STOP — get the user to add the test-mode key as a repo secret**

Ask the user to add their LemonSqueezy test-mode license key (from Task 3) as a repository secret named `SECANIX_TEST_LICENSE_KEY` on `github.com/cutryandifonna/secanix`, via `gh secret set SECANIX_TEST_LICENSE_KEY` or the GitHub UI. Do not proceed until confirmed.

- [ ] **Step 4: Push and open a real PR (valid-key case)**

```bash
git add .github/workflows/e2e-license-test.yml
git commit -m "test: e2e validation for license gate (temporary, will be reverted)"
git push origin test/license-gate-e2e
gh pr create --title "E2E test: license gate" --body "Temporary — validates the license check end to end, will be closed and branch deleted after verification." --base master
```

- [ ] **Step 5: Verify the valid-key case passes and comments**

Run: `gh pr checks` and `gh pr view --comments` on the opened PR.
Expected: the "Check Pro license" step succeeds (no warning/error annotation), the scan runs, a `<!-- secanix-report -->` comment appears, CI check passes.

- [ ] **Step 6: Verify the invalid-key case fails closed**

```bash
gh secret set SECANIX_TEST_LICENSE_KEY --body "obviously-not-a-real-key"
git commit --allow-empty -m "test: trigger re-run with invalid key"
git push origin test/license-gate-e2e
```

Wait for the workflow to complete.
Expected: the "Check Pro license" step fails with the `::error::` message about subscribing; the job stops there — no gitleaks/semgrep/osv-scanner install steps run, no new PR comment/update happens; CI check is red.

- [ ] **Step 7: Verify the missing-key case fails closed the same way**

```bash
gh secret remove SECANIX_TEST_LICENSE_KEY
git commit --allow-empty -m "test: trigger re-run with no key"
git push origin test/license-gate-e2e
```

Wait for the workflow to complete.
Expected: same fail-closed behavior as Step 6 (missing key is treated identically to invalid, per the spec).

- [ ] **Step 8: Clean up**

```bash
gh pr close test/license-gate-e2e --delete-branch
gh secret remove SECANIX_TEST_LICENSE_KEY --repo cutryandifonna/secanix || true
git checkout master
git branch -D test/license-gate-e2e
```

Confirm `master` has no leftover `.github/workflows/e2e-license-test.yml` (it only ever existed on the deleted branch).

- [ ] **Step 9: Update project memory**

This is the last task in the plan. After Step 8 passes, update the `project_payment_provider` and `project_mvp_progress` memory files to record: license-key verification shipped (`secanix@0.1.4`), `action.yml` now requires `license-key` input, end-to-end verified for valid/invalid/missing key cases on a real PR, `v1` tag retagged.
