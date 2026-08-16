# Positioning & Messaging

## Angle utama

"Security scan khusus buat app yang dibangun AI/vibe coding — cek yang gak kepikiran waktu ngoding cepat."

Bukan jual ke tim security enterprise. Jual ke builder yang baru sadar app-nya mungkin bocor tapi gak tau harus mulai dari mana.

## Target audience

- Solo builder / indie hacker yang ship produk pakai Claude Code, Cursor, v0, Bolt, dst.
- Small team (2-5 orang) tanpa security engineer dedicated.
- Ciri khas: pakai Next.js + Vercel + Supabase/Firebase, deploy cepat, iterasi cepat, security bukan prioritas nomor satu.

## Pesan inti per audiens

| Audiens | Pain point | Pesan |
|---|---|---|
| Solo builder baru launch | Takut ada yang bocor tapi gak tau cara cek | "Scan gratis, 30 detik, tau persis apa yang bocor" |
| Builder yang udah punya traffic/user | Takut kena breach, reputasi rusak | "Cek sebelum user lu yang nemuin duluan" |
| Small team scaling | Butuh proses, gak punya waktu setup security tim | "CI integration, jalan otomatis tiap PR, gak perlu security engineer" |

## Nada komunikasi

- Bahasa manusia, bukan jargon compliance/enterprise.
- Bukti lewat data nyata (temuan dari scan app open-source), bukan klaim kosong.
- Jujur soal batasan — bukan "kami cover semua celah keamanan", tapi "kami fokus ke pola kesalahan yang paling sering muncul di app hasil AI coding."

## Why not just use the audit your AI coding tool already has

Objection every prospect will raise: "my AI tool already checks this." Answer, in the voice landing page copy should use (English, human, no corporate slop):

**The thing that wrote the bug is a bad judge of the bug.** Claude Code, Cursor, v0 — whichever tool generated your app — checking its own output for security holes has the same blind spots that put the holes there in the first place. That's not a knock on the tool. It's just how self-review works, for humans or AI. Nobody skips code review because the author is smart.

**Your AI tool wants you to feel good about shipping. That's its job.** It's not lying to you, but it's also not incentivized to slow you down with scary findings. A scanner that isn't selling you the platform doesn't have that conflict.

**You don't use one tool.** Claude Code for the backend, v0 for the landing page, Cursor for the fix at 1am. Whatever audit each of those has (if any) doesn't talk to the others. One scanner that runs the same checks no matter what wrote the code is the only way to get a consistent answer.

**Pattern matching doesn't hallucinate.** We run gitleaks, semgrep, osv-scanner — the same tools security teams have trusted for years — not an LLM prompted to "check for security issues" that might say something different every time you ask. Same input, same output, every run.

**It runs in your PR, not in a chat window you'll forget.** A one-off "looks good" in a chat session disappears when you close the tab. A failing CI check blocks the merge and leaves a record of what got caught and when.

Confirmed: runs standalone from any terminal (Windows/Mac/Linux) via `npm`/`npx`, Node.js >=18. Not a Claude Code skill or plugin — no dependency on Claude Code or any specific AI tool to use it. Verified working in PowerShell and Git Bash on Windows.

## When people realize they need this

- Right after their first deploy, when the "wait, is this actually safe?" thought hits and they don't know where to start.
- When they're stitching together a project across two or three different AI tools and have no single source of truth on whether any of it is secure.
- When they need to show a user, a client, or an investor that the app was actually checked — not just "feels fine to me."
- Right after reading about someone else's vibe-coded app getting breached, and wondering if they're next.

## Yang harus dihindari

- Jangan publish nama app spesifik dari hasil scan tanpa izin eksplisit — risiko legal/reputasi.
- Jangan klaim "100% aman setelah scan" — security itu proses, bukan sertifikat sekali jalan.

## Related

- Rencana konten & channel: [content-plan.md](content-plan.md)
- Funnel konversi: [../03-sales/funnel.md](../03-sales/funnel.md)
