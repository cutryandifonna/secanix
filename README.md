# Secanix

Security scanner buat app hasil vibe-coding (Next.js + Supabase/Firebase).

## Checks

| Check | ruleId | Severity | Triggers on | Fix |
|---|---|---|---|---|
| Leaked secrets (gitleaks) | varies per gitleaks rule | Critical | Hardcoded API key/token/credential in a git-tracked or about-to-be-tracked file | Rotate the secret now, strip it from code & git history (not just a new commit), move it to an env var / secret manager |
| Exposed Supabase service role key | `supabase-service-role-key-public-env` | Critical | `NEXT_PUBLIC_*` env var holding a Supabase service role key — gets inlined into the client bundle at build time | Move it to a server-only env var, rotate the key in the Supabase dashboard if it's ever been deployed |
| Missing auth on Next.js API route | `nextjs-api-route-missing-auth` | High | A Pages/App Router API handler with no session/token check before it runs any logic | Add an auth check (`getServerSession`/`getToken`/etc.) at the top of the handler |
| Supabase RLS disabled | `supabase-rls-disabled` | Critical | A table where RLS was explicitly turned off | Re-enable RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) and add matching policies |
| Supabase RLS missing | `supabase-rls-missing` | High | A table created with no RLS enable statement at all | Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a policy for the table |
| CORS wildcard origin | `cors-wildcard-origin` | Medium | `Access-Control-Allow-Origin: *` (or equivalent) on an API response | Replace `*` with an explicit origin allowlist, or validate the origin dynamically server-side |
| Open Firebase security rules | `firebase-rules-open` | Critical | Firestore/Realtime Database/Storage rules using `if true` / `.read`/`.write: true` | Replace the allow-all rule with one that checks `request.auth != null` etc. — Firebase's default is deny-all, don't override it to allow-all |
| Exposed Firebase Admin key (env) | `firebase-admin-key-public-env` | Critical | `NEXT_PUBLIC_*` env var holding a Firebase Admin SDK key — gets inlined into the client bundle at build time | Move it to a server-only env var, rotate the key in Firebase Console if it's ever been deployed |
| Committed Firebase service account key | `firebase-service-account-key-committed` | Critical | A literal Admin SDK service-account JSON key file checked into the repo | Delete the file from the repo & git history, rotate the key in Firebase Console, store the new one in a secret manager / env var |
| Vulnerable dependency (osv-scanner) | varies (GHSA id) | Derived from CVSS score (≥9 critical, ≥7 high, ≥4 medium, else low) | A dependency with a known CVE | Update to the patched version named in the advisory |

Two checks (leaked secrets, vulnerable dependencies) delegate to gitleaks/osv-scanner, so
their `ruleId` varies per finding instead of being fixed — everything else in this table is
custom, Next.js/Supabase/Firebase-specific pattern matching.

## Prerequisites

Secanix composes battle-tested external scanners instead of re-implementing them. When you run the CLI **locally** (`npx secanix`), these tools must be available on your `PATH` — otherwise the CLI exits with `gak ketemu di PATH`:

| Tool | Used for | Required | Install guide | Error when missing |
|------|----------|----------|---------------|--------------------|
| **Node.js >=18** | Running the CLI (`npx secanix`) | `node --version` | https://nodejs.org/ | `engines.node` in `package.json:19` |
| **gitleaks** | Leaked secrets (`secret-scan` check — `src/checks/secretScan.ts:13`) | `gitleaks version` | https://github.com/gitleaks/gitleaks#installing | `gitleaks gak ketemu di PATH. Install: https://github.com/gitleaks/gitleaks#installing` |
| **semgrep** | Missing auth on Next.js API routes (`api-auth-missing` check — `src/checks/apiAuthMissing.ts:11`) | `semgrep --version` | https://semgrep.dev/docs/getting-started/ | `semgrep gak ketemu di PATH. Install: https://semgrep.dev/docs/getting-started/` |
| **osv-scanner** | Vulnerable dependencies (`dependency-cve` check — `src/checks/dependencyVulnerabilities.ts:8`) | `osv-scanner --version` | https://google.github.io/osv-scanner/installation/ | `osv-scanner gak ketemu di PATH. Install: https://google.github.io/osv-scanner/installation/` |

> **GitHub Action users:** you do **not** need to install these manually — `action.yml:16-31` installs pinned versions automatically (`gitleaks v8.30.1`, `semgrep 1.173.0`, `osv-scanner v2.5.0`) on `ubuntu-latest`. The table above is only for local CLI usage.

Quick install (macOS/Linux):

```bash
# gitleaks - pick one
brew install gitleaks
# or: go install github.com/gitleaks/gitleaks/v8@latest
# or: download binary from https://github.com/gitleaks/gitleaks/releases

# semgrep - pick one
pip install semgrep==1.173.0
# or: pipx install semgrep
# or: brew install semgrep

# osv-scanner - pick one
go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest
# or: brew install osv-scanner
# or: download binary from https://github.com/google/osv-scanner/releases (v2.5.0)
```

Verify after install:

```bash
gitleaks version && semgrep --version && osv-scanner --version
```

The other 3 checks (`exposed-service-role-key`, `rls-disabled`, `cors-wildcard`) are pure JS/TS and need no external binary.

## CLI Usage

```
npx -p secanix@latest secanix
```
Runs all checks against the current directory and prints a human-readable report.

```
npx -p secanix@latest secanix --json
```
Same scan, machine-readable JSON output — useful for piping into other tooling.

## Suppressing false positives

Some findings are correct in general but not in your case — e.g. an API route
protected by `middleware.ts` instead of an in-handler check, which
`api-auth-missing` can't see. Add a `.secanix.json` at your project root:

```json
{
  "ignore": [
    {
      "file": "app/api/admin/route.ts",
      "ruleId": "nextjs-api-route-missing-auth",
      "reason": "protected by middleware.ts, matcher /api/admin/*"
    }
  ]
}
```

Both `file` (relative path) and `ruleId` must match exactly. Suppressed
findings aren't silently dropped — they're printed separately (with your
`reason`) so they stay visible for review, not just filtered out of the JSON
output.

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

**Breaking change for existing `@v1` users:** the action now requires a valid license key. If your workflow pinned `@v1` before this check was added and doesn't set `license-key`, CI will start failing on the next run until you add the `SECANIX_LICENSE_KEY` secret.

The action fails CI when a critical finding is present (leaked secret, exposed Supabase service role key, or RLS disabled). It posts and updates a single PR comment listing all findings by severity. This requires the consuming workflow to grant `permissions: pull-requests: write` itself, as shown above — without it, comment posting fails with a 403. GitHub-hosted `ubuntu-latest` runners (uses `sudo` for tool installs — self-hosted runners need equivalent permissions).
