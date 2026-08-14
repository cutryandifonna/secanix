# Vibe Security Scanner

Security scanner khusus buat app hasil vibe-coding (Next.js/Vercel + Supabase/Firebase ecosystem). Cek celah yang paling sering lolos waktu ngoding cepat pakai AI: secret bocor, auth API route absen, RLS Supabase mati, dependency CVE.

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

## Belum diputuskan

- Nama final produk / domain.
- Payment provider (Stripe/LemonSqueezy) — tentukan pas mulai build billing.
- `.claude/settings.json` permission allowlist — buat pas command dev/build/test udah konkret.
