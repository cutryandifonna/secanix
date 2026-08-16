# Secanix

Security scanner khusus buat app hasil vibe-coding (Next.js/Vercel + Supabase/Firebase ecosystem). Cek celah yang paling sering lolos waktu ngoding cepat pakai AI: secret bocor, auth API route absen, RLS Supabase mati, dependency CVE.

Nama produk: **Secanix**, domain **secanix.com** (dipilih, belum dibeli). Rename npm package + repo GitHub udah dieksekusi (2026-08-16): `secanix@0.1.2` live di npm, `vibe-security-scanner` di-deprecate ngarah ke situ, repo GitHub `cutryandifonna/vibe-security-scanner` udah di-rename jadi `cutryandifonna/secanix`.

## Dokumen

- `docs/01-product/` — overview, MVP scope, pricing, roadmap.
- `docs/02-marketing/` — positioning, content plan.
- `docs/03-sales/` — funnel, rencana launch 30 hari, metrics, risiko.

Baca `docs/01-product/overview.md` dulu buat konteks penuh sebelum mulai build.

## Stack (rencana, belum diimplementasi)

- CLI: Node.js/TypeScript, distribusi via `npx`.
- Secret scan: gitleaks (composed, bukan reimplementasi).
- Dependency CVE: osv-scanner.
- Pattern SAST custom (Supabase RLS, Next.js auth-missing): semgrep + custom ruleset.
- CI integration: GitHub Action, comment otomatis di PR.
- Dashboard web: fase 2, belum MVP.

## Konvensi

- Compose tool security yang udah battle-tested (gitleaks, semgrep, osv-scanner). Jangan re-implement scanner dari nol.
- Custom rule hanya buat pattern AI-framework-specific yang belum ada yang jual (Supabase RLS, Next.js API auth).
- MVP dulu: CLI + 5-6 cek prioritas tinggi. Dashboard, multi-language support, auto-fix — belakangan.
- Jangan publish nama app spesifik dari hasil scan tanpa izin eksplisit (risiko legal/reputasi).

## Keputusan (2026-08-16)

- Nama final produk: **Secanix**. Domain: **secanix.com** (belum dibeli). Rename npm/repo dari `vibe-security-scanner` ke `secanix` — selesai (2026-08-16).
- Payment provider: **LemonSqueezy** (Merchant of Record, License Key API buat verifikasi Pro tier). User lagi daftar akun.

## Belum diputuskan

- `.claude/settings.json` permission allowlist — buat pas command dev/build/test udah konkret.
