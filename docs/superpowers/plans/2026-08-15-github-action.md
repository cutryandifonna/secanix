# GitHub Action customer-facing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a publishable GitHub Action that runs `vibe-security-scanner` against a consumer's repo on every PR, posts/updates a single PR comment with findings, and fails CI on any critical finding.

**Architecture:** Composite GitHub Action (`action.yml` at repo root) that installs gitleaks/semgrep/osv-scanner on the runner, runs the existing CLI in a new `--json` mode via `npx`, then uses `actions/github-script` to parse the JSON and talk to the GitHub API directly (comment + `core.setFailed`). No new build toolchain, no Docker.

**Tech Stack:** TypeScript CLI (existing), GitHub Actions composite syntax, `actions/github-script@v7` (Node 20 + `@actions/github`/`@actions/core` preloaded), npm registry for distribution.

**Spec:** `docs/superpowers/specs/2026-08-15-github-action-design.md`

## Global Constraints

- Linux-only: action targets `ubuntu-latest` runners only. No Windows/macOS support in this round.
- npm package name is `vibe-security-scanner` (already verified available). Bin name stays `scan-my-app` (unchanged) — invoke as `npx -p vibe-security-scanner@latest scan-my-app`, never bare `npx vibe-security-scanner`.
- Fail policy is fixed: CI fails only when ≥1 finding has severity `critical`. Not configurable via input in this round.
- PR comment strategy: find-and-update via hidden marker `<!-- vibe-security-scanner-report -->`, never post a second comment.
- npm publish is manual (`npm login` + `npm publish`) for this first release. No publish-on-tag automation.
- The GitHub repo must be flipped to public, and self-scanned for secrets across full git history, before tagging any release.

---

### Task 1: CLI `--json` output flag

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**
- Produces: `run(targetDir?: string, options?: { json?: boolean }): Promise<number>` — when `options.json` is true, `console.log` is called **exactly once** with `JSON.stringify(ReportedFinding[])` (fields: `file`, `line`, `ruleId`, `description`, `severity`, `fixSuggestion` — from `src/report.ts`), and the `"Vibe Security Scanner v0.1.0"` banner is suppressed so stdout is valid JSON with nothing else mixed in.

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.ts`, inside the existing `describe("run", ...)` block (after the last `it(...)`, before the closing `});`):

```ts
  it("prints JSON output with zero findings and no banner text", async () => {
    runSecretScan.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir", { json: true });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual([]);
    logSpy.mockRestore();
  });

  it("prints JSON output with severity and fixSuggestion attached to findings", async () => {
    runSecretScan.mockResolvedValue([
      { file: "src/db.ts", line: 12, ruleId: "aws-access-key", description: "AWS Access Key" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = await run("/some/dir", { json: true });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      file: "src/db.ts",
      line: 12,
      ruleId: "aws-access-key",
      severity: "critical",
      fixSuggestion: expect.any(String),
    });
    logSpy.mockRestore();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the two new tests FAIL (options param not accepted / banner still logged first / JSON.parse throws on `"Vibe Security..."`).

- [ ] **Step 3: Implement the flag in `src/cli.ts`**

Replace the whole file content with:

```ts
#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { findMissingApiAuth, SemgrepNotFoundError } from "./checks/apiAuthMissing.js";
import { findCorsWildcard } from "./checks/corsWildcard.js";
import { findDependencyVulnerabilities, OsvScannerNotFoundError } from "./checks/dependencyVulnerabilities.js";
import { findExposedServiceRoleKeys } from "./checks/exposedServiceRoleKey.js";
import { findRlsDisabledTables } from "./checks/rlsDisabled.js";
import { GitleaksNotFoundError, runSecretScan } from "./checks/secretScan.js";
import { buildReport, formatReport, type CheckFindings } from "./report.js";

export interface RunOptions {
  json?: boolean;
}

export async function run(targetDir: string = process.cwd(), options: RunOptions = {}): Promise<number> {
  const { json = false } = options;

  if (!json) {
    console.log("Vibe Security Scanner v0.1.0");
  }

  const checkFindings: CheckFindings[] = [];

  try {
    checkFindings.push({ checkId: "secret-scan", findings: await runSecretScan(targetDir) });
  } catch (err) {
    if (err instanceof GitleaksNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  checkFindings.push({
    checkId: "exposed-service-role-key",
    findings: await findExposedServiceRoleKeys(targetDir),
  });

  try {
    checkFindings.push({ checkId: "api-auth-missing", findings: await findMissingApiAuth(targetDir) });
  } catch (err) {
    if (err instanceof SemgrepNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  checkFindings.push({ checkId: "rls-disabled", findings: await findRlsDisabledTables(targetDir) });
  checkFindings.push({ checkId: "cors-wildcard", findings: await findCorsWildcard(targetDir) });

  try {
    checkFindings.push({
      checkId: "dependency-cve",
      findings: await findDependencyVulnerabilities(targetDir),
    });
  } catch (err) {
    if (err instanceof OsvScannerNotFoundError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }

  const reported = buildReport(checkFindings);

  if (json) {
    console.log(JSON.stringify(reported));
  } else {
    for (const line of formatReport(reported)) {
      console.log(line);
    }
  }

  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const targetDir = args.find((arg) => arg !== "--json");
  process.exit(await run(targetDir, { json }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, including the two new ones and every pre-existing test in `test/cli.test.ts` and `test/report.test.ts`.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: succeeds, `dist/cli.js` produced.

- [ ] **Step 6: Real run — verify JSON mode against this repo**

Run: `node dist/cli.js --json .`
Expected: single line of valid JSON (pipe to `node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"` or similar to confirm parseability), no banner text before it.

Run: `node dist/cli.js .`
Expected: unchanged human-readable output (regression check — non-json path untouched).

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add --json output flag to CLI for machine consumption"
```

---

### Task 2: Publish to npm

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1's `run()` (already built into `dist/`).
- Produces: `vibe-security-scanner@0.1.0` published on the public npm registry, installable via `npx -p vibe-security-scanner@latest scan-my-app`.

- [ ] **Step 1: Flip `package.json` to publishable**

In `package.json`, change:

```json
  "private": true,
```

to:

```json
  "private": false,
```

- [ ] **Step 2: Dry-run the publish to verify package contents**

Run: `npm run build`
Run: `npm publish --dry-run`
Expected: output lists only `dist/**` files (per existing `"files": ["dist"]` field) plus standard npm-included files (`package.json`, `README.md` if present) — no `src/`, no `test/`, no `node_modules`, no `.env*`.

- [ ] **Step 3: Dogfood — run the full CLI against this repo**

Run: `node dist/cli.js .`
Expected: zero `CRITICAL` findings in the output. If any critical finding shows up, STOP — fix it before continuing (don't publish or go public with a known critical issue in our own repo).

- [ ] **Step 4: Full-history secret scan before going public**

Run: `gitleaks detect --source . -v` (no `--no-git` flag — this scans full commit history, unlike the working-tree-only mode our own CLI uses internally).
Expected: `no leaks found`. If gitleaks reports any leak, STOP — do not proceed to publish or make the repo public; report the finding and wait for the user's direction (this is a real secret exposure and needs its own remediation, not a scripted fix).

- [ ] **Step 5: Commit the package.json change**

```bash
git add package.json
git commit -m "chore: mark package publishable for npm release"
```

- [ ] **Step 6: STOP — confirm before publishing**

npm publish is effectively irreversible (unpublish is only allowed within 72 hours and is discouraged). Before running the next command, confirm explicitly with the user that they want to publish `vibe-security-scanner@0.1.0` to the public npm registry now.

- [ ] **Step 7: Publish (only after explicit confirmation)**

Run: `npm login` (if not already authenticated to npm)
Run: `npm publish`
Expected: package appears at `https://www.npmjs.com/package/vibe-security-scanner`.

- [ ] **Step 8: Verify the published package actually runs**

Run: `npx -p vibe-security-scanner@latest scan-my-app --json .` (from any directory, e.g. `cd /tmp && npx ...` or the repo root)
Expected: valid JSON array printed, same shape as Task 1's local dist run.

---

### Task 3: Composite `action.yml`

**Files:**
- Create: `action.yml` (repo root)

**Interfaces:**
- Consumes: published `vibe-security-scanner@latest` (Task 2) via `npx -p vibe-security-scanner@latest scan-my-app --json <dir>`, producing a JSON array of objects shaped `{ file: string, line: number, ruleId: string, description: string, severity: "critical"|"high"|"medium"|"low", fixSuggestion: string }`.
- Produces: a reusable composite action consumers reference as `uses: cutryandifonna/vibe-security-scanner@v1`, input `working-directory` (optional, default `.`).

- [ ] **Step 1: Write `action.yml`**

```yaml
name: "Vibe Security Scanner"
description: "Scan Next.js/Supabase apps for leaked secrets, missing API auth, disabled RLS, CORS wildcards, and vulnerable dependencies."
inputs:
  working-directory:
    description: "Directory to scan, relative to the repo root."
    required: false
    default: "."
runs:
  using: "composite"
  steps:
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20

    - name: Install gitleaks
      shell: bash
      run: |
        curl -sSfL -o "$RUNNER_TEMP/gitleaks.tar.gz" https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
        tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks
        sudo mv "$RUNNER_TEMP/gitleaks" /usr/local/bin/gitleaks

    - name: Install semgrep
      shell: bash
      run: pip install semgrep

    - name: Install osv-scanner
      shell: bash
      run: |
        sudo curl -sSfL -o /usr/local/bin/osv-scanner https://github.com/google/osv-scanner/releases/download/v2.5.0/osv-scanner_linux_amd64
        sudo chmod +x /usr/local/bin/osv-scanner

    - name: Run vibe-security-scanner
      shell: bash
      run: |
        npx -y -p vibe-security-scanner@latest scan-my-app --json "${{ inputs.working-directory }}" > "$RUNNER_TEMP/vibe-scan-report.json"

    - name: Report results
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const path = require('path');

          const reportPath = path.join(process.env.RUNNER_TEMP, 'vibe-scan-report.json');
          const findings = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

          const severityOrder = ['critical', 'high', 'medium', 'low'];
          const severityLabel = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
          const severityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

          const counts = { critical: 0, high: 0, medium: 0, low: 0 };
          for (const finding of findings) {
            counts[finding.severity]++;
          }

          const marker = '<!-- vibe-security-scanner-report -->';
          const lines = [marker, '## Vibe Security Scanner'];

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
                lines.push(`- \`${finding.file}:${finding.line}\` — ${finding.description}`);
                lines.push(`  - Fix: ${finding.fixSuggestion}`);
              }
            }
          }

          const body = lines.join('\n');

          if (context.eventName === 'pull_request') {
            const { owner, repo } = context.repo;
            const issue_number = context.payload.pull_request.number;

            const comments = await github.rest.issues.listComments({ owner, repo, issue_number });
            const existing = comments.data.find((c) => c.body.includes(marker));

            if (existing) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }
          }

          if (counts.critical > 0) {
            core.setFailed(`${counts.critical} critical finding(s) found`);
          }
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python -c "import yaml; yaml.safe_load(open('action.yml', encoding='utf-8')); print('valid')"`
Expected: `valid` printed, no exception.

- [ ] **Step 3: Commit**

```bash
git add action.yml
git commit -m "feat: add composite GitHub Action for CI scanning + PR comments"
```

---

### Task 4: Make repo public, tag release, document usage

**Files:**
- Modify: `README.md` (create if it doesn't exist yet — check first)

**Interfaces:**
- Consumes: `action.yml` from Task 3, published package from Task 2.
- Produces: public repo, git tags `v0.1.0` and `v1` on the commit containing `action.yml`, a usage example in the README for consumers.

- [ ] **Step 1: Check for existing README**

Run: `test -f README.md && echo exists || echo missing`

- [ ] **Step 2: Add/update the consumer usage section**

Add this section to `README.md` (append if the file exists, create with just this section as a minimal placeholder if it doesn't):

```markdown
## GitHub Action

Add to `.github/workflows/security-scan.yml` in your repo:

\`\`\`yaml
name: Security Scan
on: pull_request
permissions:
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cutryandifonna/vibe-security-scanner@v1
\`\`\`

The action fails CI when a critical finding is present (leaked secret, exposed Supabase service role key, or RLS disabled). It posts and updates a single PR comment listing all findings by severity. Linux runners (`ubuntu-latest`) only.
```

- [ ] **Step 3: Commit the README**

```bash
git add README.md
git commit -m "docs: add GitHub Action usage example for consumers"
```

- [ ] **Step 4: STOP — confirm before making the repo public**

Flipping repo visibility is a real, consequential action (exposes full commit history, code, and docs to the public). Confirm explicitly with the user immediately before running the next command, even though they already approved this in the design phase — this is the point of no easy return.

- [ ] **Step 5: Make the repo public**

Run: `gh repo edit cutryandifonna/vibe-security-scanner --visibility public --accept-visibility-change-consequences`
Expected: command succeeds; verify with `gh repo view cutryandifonna/vibe-security-scanner --json visibility`.

- [ ] **Step 6: Push and tag**

```bash
git push origin master
git tag -a v0.1.0 -m "First public release: composite GitHub Action + scanner CLI"
git tag -a v1 -m "Major version tag for cutryandifonna/vibe-security-scanner@v1 usage"
git push origin v0.1.0 v1
```

---

### Task 5: End-to-end validation on a real PR

**Files:**
- Create (temporary, reverted at the end): one file in a scratch branch that trips a known check (e.g. a CORS wildcard).

**Interfaces:**
- Consumes: the tagged `v1` action from Task 4.
- Produces: no permanent code change — this task's deliverable is confidence that the whole pipeline (install tools → scan → comment → update comment → fail on critical) actually works against the real GitHub API, not mocks.

- [ ] **Step 1: Create a workflow that uses the tagged action, on a scratch branch**

```bash
git checkout -b test/action-e2e
```

Create `.github/workflows/e2e-test.yml`:

```yaml
name: E2E Action Test
on: pull_request
permissions:
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cutryandifonna/vibe-security-scanner@v1
```

- [ ] **Step 2: Introduce one deliberate medium-severity finding**

Create `test-fixtures/e2e/route.ts`:

```ts
export function GET() {
  return new Response("ok", {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

(This trips `cors-wildcard-origin`, severity `medium` — won't fail CI, just proves the comment path works without also blocking the PR.)

- [ ] **Step 3: Push and open a real PR**

```bash
git add .github/workflows/e2e-test.yml test-fixtures/e2e/route.ts
git commit -m "test: e2e validation for GitHub Action (temporary, will be reverted)"
git push origin test/action-e2e
gh pr create --title "E2E test: GitHub Action" --body "Temporary — validates action.yml end to end, will be closed and branch deleted after verification." --base master
```

- [ ] **Step 4: Verify the comment appears**

Run: `gh pr checks` and `gh pr view --comments` on the opened PR.
Expected: a PR comment containing `<!-- vibe-security-scanner-report -->`, showing 1 medium finding for `test-fixtures/e2e/route.ts`, and the CI check passing (no critical finding, so no failure).

- [ ] **Step 5: Verify comment update-in-place on a second push**

```bash
git commit --allow-empty -m "test: trigger second scan run"
git push origin test/action-e2e
```

Wait for the workflow to complete, then re-check `gh pr view --comments` on the same PR.
Expected: still exactly **one** `vibe-security-scanner` comment (same comment ID, updated body/timestamp) — not two.

- [ ] **Step 6: Verify fail-on-critical**

Temporarily replace `test-fixtures/e2e/route.ts` content with something that trips a critical check, e.g. add a file `test-fixtures/e2e/.env.local` containing `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=sk-test-fake-not-a-real-key`.

```bash
git add test-fixtures/e2e/.env.local
git commit -m "test: trigger critical finding for fail-on-critical verification"
git push origin test/action-e2e
```

Expected: CI check on the PR goes red, workflow log shows `core.setFailed` message `"1 critical finding(s) found"`.

- [ ] **Step 7: Clean up**

```bash
gh pr close test/action-e2e --delete-branch
git checkout master
git branch -D test/action-e2e
```

Confirm `master` has no leftover `test-fixtures/e2e/` or `.github/workflows/e2e-test.yml` (they only ever existed on the deleted branch — nothing to revert on `master` itself).

- [ ] **Step 8: Update project memory**

This is the last task in the plan — after Step 7 passes, update the `project_mvp_progress` memory file to record that the customer-facing GitHub Action (fase 2) is live: package published, action tagged `v1`, end-to-end verified on a real PR.
