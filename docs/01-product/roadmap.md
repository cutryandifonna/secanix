# Roadmap

## Fase 1 — MVP (2 minggu)
- CLI `npx scan-my-app`.
- 5-6 cek prioritas tinggi (lihat [mvp-scope.md](mvp-scope.md)).
- Laporan markdown, bahasa manusia.
- Testing rules terhadap 5-10 app open-source vibe-coded — validasi false-positive rate rendah sebelum launch.

## Fase 2 — CI Integration (2 minggu)
- GitHub Action.
- Comment otomatis di PR (inline, per finding).
- Listing di GitHub Marketplace.

## Fase 3 — Retensi & Scale (belakangan, dipicu demand)
- Dashboard web, historical tracking, trend severity dari waktu ke waktu.
- Alert Slack/Discord real-time.
- Team tier — multi-repo, priority rule update.

## Fase 4 — belum diputuskan, tunggu sinyal pasar
- Auto-fix suggestion (bukan auto-eksekusi).
- Dukungan framework lain (Python/Django, Ruby/Rails) — cuma kalau demand dari user existing minta.

Jangan mulai fase berikutnya sebelum fase sebelumnya punya user aktif yang pakai — hindari bangun fitur speculative.
