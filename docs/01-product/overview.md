# Product Overview

## Masalah

Vibe coder (builder yang ship app cepat pakai AI — Claude Code, Cursor, v0, dst) sering lolosin celah keamanan dasar karena fokus ke "jalan dulu", bukan "aman dulu". Pola bocor yang paling sering:

- Supabase service role key ketiban ke client bundle.
- API route Next.js tanpa auth check.
- `.env` ke-commit ke repo publik / secret hardcoded di kode.
- RLS (row-level security) Supabase mati atau salah konfigurasi.
- CORS wildcard (`*`) di production.
- Dependency dengan CVE dikenal, gak pernah di-update.
- Rate limiting absen di endpoint publik.
- Debug/console log bocorin data sensitif.

Tool security existing (Snyk, GitGuardian, Semgrep generik) dibangun buat tim enterprise dengan security engineer. Vibe coder solo gak punya waktu/skill buat setup itu, dan gak butuh compliance report — mereka butuh "kasih tau gue apa yang bocor, sekarang, dalam bahasa yang gue ngerti."

## Solusi

Scanner ringan, fokus ke pola kesalahan yang spesifik muncul di app hasil AI-assisted coding (Next.js + Supabase/Firebase ecosystem). Jalan satu baris command, hasil dalam hitungan detik, bahasa laporan gak pakai jargon security tim enterprise.

## Positioning

**Bukan** "enterprise security scanner". **Adalah** "security check khusus buat app yang dibangun cepat pakai AI — nemuin yang kelewat waktu ngoding cepat."

Target: builder solo / indie hacker / small team yang ship produk pakai AI coding tool, belum punya security engineer.

## Diferensiasi vs kompetitor

| Kompetitor | Kenapa gak cocok buat target ini |
|---|---|
| Snyk, GitGuardian | Enterprise-focused, setup ribet, harga mahal buat solo builder |
| Semgrep (generik) | Powerful tapi butuh nulis rule sendiri, gak ada preset buat pola AI-framework |
| `npm audit` manual | Cuma cover dependency CVE, gak cover config/auth/secret |

Vibe Security Scanner bedanya: preset rule spesifik buat pola kesalahan Next.js + Supabase/Firebase, laporan bahasa manusia, setup nol-konfigurasi.

## Related

- Scope teknis: [mvp-scope.md](mvp-scope.md)
- Harga: [pricing.md](pricing.md)
- Marketing angle: [../02-marketing/positioning.md](../02-marketing/positioning.md)
