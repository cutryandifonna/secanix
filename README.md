# Secanix

Security scanner buat app hasil vibe-coding (Next.js + Supabase/Firebase).

Checks it runs:
- Leaked secrets (API keys, tokens, credentials committed to the repo)
- Exposed Supabase service role keys
- Missing auth on Next.js API routes
- Disabled Supabase Row Level Security (RLS)
- CORS wildcard origins
- Vulnerable dependencies (known CVEs)

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

## GitHub Action

Add to `.github/workflows/security-scan.yml` in your repo:

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
```

The action fails CI when a critical finding is present (leaked secret, exposed Supabase service role key, or RLS disabled). It posts and updates a single PR comment listing all findings by severity. This requires the consuming workflow to grant `permissions: pull-requests: write` itself, as shown above — without it, comment posting fails with a 403. GitHub-hosted `ubuntu-latest` runners (uses `sudo` for tool installs — self-hosted runners need equivalent permissions).
