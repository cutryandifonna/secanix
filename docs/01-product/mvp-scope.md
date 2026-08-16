# MVP Scope

## Cek prioritas tinggi (MVP — 5-6 cek ini dulu)

1. Secret/API key bocor — di kode, di git history, di client bundle.
2. Supabase service role key ketiban ke client.
3. API route Next.js tanpa auth check.
4. CORS misconfig (wildcard `*` di production).
5. RLS Supabase mati/salah.
6. Dependency dengan CVE dikenal.

## Fase 2 (belakangan, bukan MVP)

- `.env` ke-commit ke git history (perlu scan history, bukan cuma working tree).
- Debug/console log bocorin data sensitif.
- Rate limiting absen di endpoint publik.
- Dashboard web + historical tracking.
- Auto-fix suggestion (bukan auto-fix eksekusi — riskan kalau salah).

## Arsitektur — ladder, jangan bangun scanner dari nol

- **Secret scan** → compose **gitleaks** atau **trufflehog** (open-source, battle-tested). Jangan tulis regex sendiri.
- **Dependency CVE** → compose **osv-scanner** (Google) atau `npm audit` API.
- **Pattern SAST custom** (Supabase RLS check, Next.js auth-missing) → **semgrep** + custom ruleset. Ini satu-satunya bagian yang emang harus ditulis sendiri — belum ada preset jadi buat pola AI-framework ini di pasar.
- Bungkus semua output jadi satu laporan terpadu: severity, file, line, fix suggestion, bahasa manusia (bukan jargon CVE).

## Bentuk produk

- **CLI**: `npx secanix` — jalan lokal, hasil di terminal + link laporan web (opsional).
- **GitHub Action**: versi CI, auto-scan tiap PR, comment inline di diff.
- **Dashboard**: fase 2, historical tracking + trend, bukan MVP.

## Roadmap build

| Fase | Durasi | Output |
|---|---|---|
| Fase 1 | 2 minggu | CLI + 5-6 cek MVP + laporan markdown |
| Fase 2 | 2 minggu | GitHub Action, comment otomatis di PR |
| Fase 3 | belakangan | Dashboard web, tracking historis, alert Slack/Discord |

## Skip sengaja (jangan bangun sekarang)

- Multi-language support (fokus JS/TS ecosystem dulu — itu yang dipakai vibe coder mayoritas).
- UI dashboard fancy sebelum ada demand tervalidasi.
- Auto-fix otomatis (kasih suggestion aja).

## Risiko teknis

- **False positive tinggi** → bikin orang ilfeel dan churn. Custom semgrep rules butuh testing ketat terhadap app real sebelum launch (lihat rencana testing di fase 1).
- Rules harus di-maintain seiring framework berubah (Next.js App Router vs Pages Router, Supabase SDK versi baru).

## Related

- Latar masalah: [overview.md](overview.md)
- Harga tiap tier: [pricing.md](pricing.md)
