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
      - uses: cutryandifonna/vibe-security-scanner@v1
```

The action fails CI when a critical finding is present (leaked secret, exposed Supabase service role key, or RLS disabled). It posts and updates a single PR comment listing all findings by severity. Linux runners (`ubuntu-latest`) only.
