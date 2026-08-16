# Secanix

Security scanner buat app hasil vibe-coding (Next.js + Supabase/Firebase).

Checks it runs:
- Leaked secrets (API keys, tokens, credentials committed to the repo)
- Exposed Supabase service role keys
- Missing auth on Next.js API routes
- Disabled Supabase Row Level Security (RLS)
- CORS wildcard origins
- Vulnerable dependencies (known CVEs)

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
