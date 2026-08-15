# GitHub Action customer-facing — design

Status: approved by user 2026-08-15, pending final spec review.

## Context

MVP fase 1 (6 check + unified severity report) done. Fase 2 per
`docs/01-product/mvp-scope.md` dan `pricing.md` (Team tier): CI
integration lewat GitHub Action + comment otomatis di PR. Ini dokumen
desain buat fase itu.

## Decisions locked in during brainstorming

- **Distribusi**: `npx vibe-security-scanner@latest` dari npm registry
  (bukan bundled JS action, bukan Docker). Konsekuensi: nama package
  harus final sekarang.
- **Nama produk/package**: `vibe-security-scanner` — sama kayak nama
  repo & docs sekarang, nol migrasi. Dicek available di npm registry
  (2026-08-15).
- **Bin CLI**: tetep `scan-my-app` (nggak di-rename). Docs marketing
  (`docs/02-marketing`, `docs/03-sales`, `docs/01-product/roadmap.md`,
  `mvp-scope.md`) udah sebut nama itu — invoke via
  `npx -p vibe-security-scanner@latest scan-my-app`, bukan
  `npx vibe-security-scanner@latest` langsung (nama package ≠ nama
  bin, jadi bentuk plain `npx <package>` nggak resolve).
- **Fail policy**: exit non-zero (CI gagal) kalau ada finding severity
  `critical`. High/medium/low nongol di comment tapi nggak block.
  Nggak configurable dulu (YAGNI, satu policy tetap dulu, bisa jadi
  input kalau ada demand).
- **Comment strategy**: update comment lama (cari via HTML marker
  tersembunyi), bukan comment baru tiap run.
- **Repo visibility**: publikan repo sebelum tag release — Action di
  repo private cuma kepake internal org yang sama, nggak berguna buat
  customer eksternal.
- **npm publish**: manual (`npm login` + `npm publish`) buat rilis
  v0.1.0 pertama. Automasi publish-on-tag ditunda sampe ada rilis
  kedua/ketiga yang nunjukkin polanya stabil.

## Architecture

Composite GitHub Action (`action.yml` di root repo, `runs.using:
composite`), bukan JS/Docker action. Alasannya: CLI-nya udah ada &
battle-tested, composite tinggal orkestrasi shell steps + satu
`actions/github-script` step buat GitHub API — nggak perlu toolchain
build/bundling baru (ncc dst), match konvensi project "compose tool
yang ada, jangan reimplement dari nol."

Constraint eksplisit: composite action ini **Linux-only** (asumsi
`ubuntu-latest` runner) — sama kayak asumsi existing dogfooding CI.
Nggak didesain buat Windows/macOS runners.

## Components

### 1. CLI `--json` flag (`src/cli.ts`)

`buildReport()` di `src/report.ts` udah return `ReportedFinding[]`
terstruktur (sorted by severity) — tinggal serialize.

- Flag `--json` (posisi bebas di argv, target dir tetep positional
  arg lain).
- Kalau flag ada: `run()` print `JSON.stringify(buildReport(...))` ke
  stdout, skip `formatReport()`/`console.log` text biasa.
- Exit code CLI **nggak berubah**: 0 = scan jalan normal (temuan ada
  atau nggak, itu bukan error), 1 cuma kalau tool dependency
  (gitleaks/semgrep/osv-scanner) nggak ketemu di PATH. Fail-on-critical
  itu logic punya Action, bukan CLI — CLI tetep dumb reporter.

### 2. `package.json`

- `"private": false` (buka buat publish).
- Name/bin nggak berubah (lihat "Decisions" di atas).

### 3. `action.yml` (root repo)

Steps garis besar:

1. `actions/setup-node@v4` (node 20).
2. Install gitleaks — download release binary pinned version dari
   GitHub releases, taro di PATH.
3. Install semgrep — `pip install semgrep` (match cara install lokal
   yang udah kepake, per catatan project).
4. Install osv-scanner — download release binary pinned version dari
   GitHub releases, taro di PATH.
5. Run `npx -p vibe-security-scanner@latest scan-my-app --json .`,
   capture stdout jadi file/output variable.
6. `actions/github-script@v7` step:
   - Parse JSON output.
   - Hitung count per severity.
   - Build comment markdown: ringkasan count + grouped by severity
     (critical→low) + `file:line`, description, fix suggestion per
     finding (reuse struktur yang sama kayak `formatReport` tapi
     Markdown).
   - Cuma jalan comment logic kalau `github.event_name ==
     'pull_request'` (skip di push biasa — nggak ada PR buat
     di-comment).
   - Cari comment existing dari bot via HTML marker
     `<!-- vibe-security-scanner-report -->` di body → kalau ketemu,
     `updateComment`; kalau nggak, `createComment`.
   - `core.setFailed(...)` kalau ada ≥1 finding severity `critical`.

Versioning: consumer pake `uses:
cutryandifonna/vibe-security-scanner@v1` — perlu tag `v1` (atau
`v0.1.0` lalu moving tag `v1` nunjuk situ) setelah action.yml siap &
di-test.

### 4. Docs consumer

Tambah contoh workflow YAML di README (atau `docs/01-product/`) buat
customer:

```yaml
permissions:
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cutryandifonna/vibe-security-scanner@v1
```

Catet eksplisit: consumer WAJIB set `permissions: pull-requests:
write` sendiri di workflow-nya — composite action nggak bisa nge-set
permission buat caller.

## Data flow

```
consumer PR push
  → consumer workflow checkout code
  → uses: vibe-security-scanner@v1 (composite)
      → install gitleaks/semgrep/osv-scanner
      → npx vibe-security-scanner --json .  (stdout: ReportedFinding[])
      → github-script: parse → build markdown → find/update PR comment
      → core.setFailed() kalau ada critical
  → consumer CI check merah/ijo sesuai fail policy
```

## Error handling

- Tool install gagal (network/release URL berubah) → step itu sendiri
  fail natural (curl/pip exit non-zero), Action fail dengan pesan
  jelas dari step yang gagal — nggak perlu custom handling tambahan.
- CLI throw `GitleaksNotFoundError` dkk (edge case: install step
  "sukses" tapi binary nggak beneran ke-PATH) → exit code 1, step
  "run CLI" fail, Action berhenti sebelum comment step (nggak ada
  JSON buat di-parse, wajar).
- `npx` gagal resolve package (belum ke-publish / typo version) →
  step fail natural juga.

## Testing

- Unit test flag `--json` di `src/cli.test.ts` (atau file test cli
  yang udah ada) — pola sama kayak test existing (assert output
  shape/JSON.parse-able), pake pola mocking yang sama.
- Action YAML/composite logic nggak bisa di-unit-test lewat vitest.
  Validasi end-to-end manual: push branch berisi 1 finding sengaja
  (misal CORS wildcard), buka PR beneran di repo ini, pastiin:
  1. Comment muncul dengan format benar.
  2. Re-push commit lain → comment ke-update (bukan comment baru).
  3. Kalau ada critical finding → CI check merah.
  4. Revert finding sengaja setelah verifikasi.

## Pre-publish checklist (sebelum flip repo ke public)

- Jalanin scanner sendiri (dogfood) ke seluruh repo, mastiin nol
  finding critical (terutama secret-scan) sebelum publik.
- Review `git log` full history buat mastiin nggak ada `.env`/kredensial
  kepencet ke-commit kapanpun (gitleaks working-tree scan aja nggak
  cakup history).

## Out of scope (fase belakangan)

- Configurable fail-on-severity via action input.
- Automasi npm publish on tag.
- Dashboard/historical tracking (fase 3, udah dicatet di roadmap).
- Windows/macOS runner support.
