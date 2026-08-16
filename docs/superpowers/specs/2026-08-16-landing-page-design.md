# Secanix Landing Page — Design Spec

Date: 2026-08-16

## Purpose

First public-facing landing page for Secanix. Goal: communicate the positioning ("security scan built for vibe-coded apps"), pre-empt the "my AI tool already checks this" objection, and collect waitlist emails ahead of pricing/checkout being ready (LemonSqueezy account still being set up).

## Repo & Stack

- New, separate repo: `secanix-landing`. Not folded into the `secanix` CLI/GitHub Action monorepo — decouples landing page iteration from CLI release cycle.
- Next.js (App Router), TypeScript, Tailwind CSS.
- Deploy: Vercel. Preview/Vercel subdomain first; custom domain `secanix.com` wired once purchased.
- Theme: dark-only. No light mode, no theme toggle — fewer states, matches "security scanner" tone from the start.

## Pages

Single page (`app/page.tsx`), sections top to bottom:

1. **Navbar** — sticky, glassmorphism (`backdrop-blur-md`, translucent dark background, subtle bottom border). Logo left, nav links, CTA button ("Get started") scrolling to waitlist section.
2. **Hero** — headline built on the core angle ("security scan khusus buat app hasil vibe-coding"), subheadline, CTA. Includes `<TerminalDemo />`: a macOS-style terminal window mockup with a typewriter animation that types `npx secanix scan`, then reveals simulated scan output lines one at a time (e.g. `✓ secret-scan`, `✗ RLS disabled: 2 tables`, `✗ CORS wildcard`, `3 issues found`). Pure CSS + `setInterval`, no animation library. Plays once per page load and stops at the end (not looping) to avoid being distracting.
3. **Problem** — the 8 leak patterns from `docs/01-product/overview.md` (secret in client bundle, missing API auth, `.env` committed, RLS off/misconfigured, CORS wildcard, unpatched CVE deps, missing rate limiting, debug logs leaking data).
4. **"Why not just use your AI tool's own audit"** — the 5-point objection-handling copy from `docs/02-marketing/positioning.md`, used close to verbatim (it's already tuned copy, not a draft).
5. **How it works** — composes gitleaks + semgrep + osv-scanner; runs as CLI (`npx`) and as a GitHub Action that comments on PRs.
6. **Pricing teaser** — summary from `docs/01-product/pricing.md`. No checkout link yet (Pro tier billing not live).
7. **Waitlist + footer** — email capture form.

## Waitlist flow

- Client form (email input + honeypot hidden field for basic bot filtering — no captcha).
- `POST /app/api/waitlist/route.ts` validates email format, rejects if honeypot filled, then calls Resend Audiences API (`audiences.contacts.create`) using `RESEND_API_KEY` (Vercel env var).
- No database — Resend Audience is the system of record for the waitlist. Reused later to send the launch announcement.

## Testing

- `test/waitlist.test.ts`: API route rejects malformed email and honeypot-filled submissions, accepts valid ones (mock the Resend client).
- Manual verification: run dev server, submit the form for real, confirm the contact appears in the Resend dashboard.

## Explicitly out of scope (MVP)

- Blog, i18n, analytics integration, multi-page site.
- Light mode / theme toggle.
- Checkout / payment on the page (blocked on LemonSqueezy setup).
- Captcha (honeypot is enough for a v1 waitlist form).

## Open items for implementation

- Resend account + API key: user is setting this up; implementation plan should treat `RESEND_API_KEY` as an env var to be supplied, not something to provision.
- Exact copy for hero headline/subheadline: draft from positioning.md's "angle utama" during implementation, not fixed in this spec.
