# Secanix Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page, dark-only Next.js landing page for Secanix with a terminal-animation hero and a Resend-backed email waitlist, in its own new repo.

**Architecture:** Next.js App Router app, no database. One page (`app/page.tsx`) composed from small section components under `components/`. The only server-side logic is `app/api/waitlist/route.ts`, which validates a submitted email and forwards it to a Resend Audience — Resend is the system of record for the waitlist, no DB needed.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, `resend` SDK, Vitest for the one route test, deployed to Vercel.

**Spec:** `docs/superpowers/specs/2026-08-16-landing-page-design.md`

## Global Constraints

- New repo, separate from the `secanix` CLI/Action repo. Location: `D:\ai-automasi-builder\secanix-landing`.
- Dark-only theme. No light mode, no theme toggle.
- No animation library (no framer-motion) — terminal typewriter effect is plain CSS + `setInterval`.
- No database — waitlist emails go straight to Resend Audiences via `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` env vars (Vercel env, supplied later — treat as configuration, not something this plan provisions).
- No captcha — a hidden honeypot field is the only bot mitigation for v1.
- No checkout/payment UI — pricing section is a teaser only.
- Copy for "Why not just use your AI tool's own audit" is reused close to verbatim from `docs/02-marketing/positioning.md` — it's already-tuned copy, not a draft to rewrite.

---

### Task 1: Scaffold the Next.js repo

**Files:**
- Create: entire `D:\ai-automasi-builder\secanix-landing` repo (via `create-next-app`)
- Create: `D:\ai-automasi-builder\secanix-landing\vitest.config.ts`
- Modify: `D:\ai-automasi-builder\secanix-landing\package.json` (add `test` script, `vitest` devDependency)

**Interfaces:**
- Produces: a Next.js App Router project at `D:\ai-automasi-builder\secanix-landing` with TypeScript, Tailwind, ESLint, `@/*` import alias, and `npm test` running Vitest.

- [ ] **Step 1: Scaffold with create-next-app**

Run from `D:\ai-automasi-builder`:

```bash
npx --yes create-next-app@latest secanix-landing --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
cd secanix-landing
```

- [ ] **Step 2: Verify the scaffold builds**

Run: `npm run build`
Expected: build completes with no errors, `.next` output produced.

- [ ] **Step 3: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 6: Verify Vitest runs with no tests yet**

Run: `npm test`
Expected: "No test files found" (exit code may be non-zero — that's fine, no tests exist yet).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js landing page repo"
```

---

### Task 2: Dark-only shell (layout + global styles)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: a root layout that forces dark background/text globally, with a monospace font available via a `font-mono` Tailwind utility (Next.js default) for the terminal component in Task 4.

- [ ] **Step 1: Replace `app/globals.css` Tailwind base with dark defaults**

Replace the contents of `app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  color-scheme: dark;
}

body {
  background-color: #09090b; /* zinc-950 */
  color: #e4e4e7; /* zinc-200 */
}
```

- [ ] **Step 2: Update `app/layout.tsx` metadata and root classes**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secanix — security scan for vibe-coded apps",
  description:
    "Find the leaks that get missed when you ship fast with AI: secrets, missing auth, disabled RLS, CVEs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-200 antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify dev server renders dark background**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: blank dark page (default `app/page.tsx` content still present, just dark now), no console errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: dark-only theme shell"
```

---

### Task 3: Navbar (glassmorphism)

**Files:**
- Create: `components/Navbar.tsx`

**Interfaces:**
- Produces: `Navbar` component (default export), no props. Renders links that anchor-scroll to `#waitlist`.

- [ ] **Step 1: Create the component**

Create `components/Navbar.tsx`:

```tsx
export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="font-mono text-lg font-semibold text-zinc-100">
          secanix
        </span>
        <nav className="hidden gap-6 text-sm text-zinc-300 sm:flex">
          <a href="#problem" className="hover:text-zinc-100">
            The problem
          </a>
          <a href="#how-it-works" className="hover:text-zinc-100">
            How it works
          </a>
          <a href="#pricing" className="hover:text-zinc-100">
            Pricing
          </a>
        </nav>
        <a
          href="#waitlist"
          className="rounded-md border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Get started
        </a>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Mount it in the page temporarily to eyeball it**

In `app/page.tsx`, add `import Navbar from "@/components/Navbar";` and render `<Navbar />` as the first element (this will be reorganized in Task 12 — fine to leave in place until then).

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: sticky navbar at top, translucent/blurred background visible when the page has content behind it (scroll test can wait until Task 12 when there's enough page height).

- [ ] **Step 4: Commit**

```bash
git add components/Navbar.tsx app/page.tsx
git commit -m "feat: add navbar with glassmorphism"
```

---

### Task 4: TerminalDemo component (typewriter animation)

**Files:**
- Create: `components/TerminalDemo.tsx`

**Interfaces:**
- Produces: `TerminalDemo` component (default export), no props, client component (`"use client"`). Self-contained — plays its typing animation once on mount, does not loop.

- [ ] **Step 1: Create the component**

Create `components/TerminalDemo.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

const COMMAND = "npx secanix scan";

const OUTPUT_LINES = [
  "✓ secret-scan",
  "✗ RLS disabled: 2 tables",
  "✗ CORS wildcard: production",
  "3 issues found",
];

export default function TerminalDemo() {
  const [typedCommand, setTypedCommand] = useState("");
  const [visibleLines, setVisibleLines] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let charIndex = 0;
    const typeTimer = setInterval(() => {
      charIndex += 1;
      setTypedCommand(COMMAND.slice(0, charIndex));

      if (charIndex >= COMMAND.length) {
        clearInterval(typeTimer);

        let lineIndex = 0;
        const lineTimer = setInterval(() => {
          lineIndex += 1;
          setVisibleLines(lineIndex);

          if (lineIndex >= OUTPUT_LINES.length) {
            clearInterval(lineTimer);
            setShowCursor(false);
          }
        }, 500);
      }
    }, 60);

    return () => clearInterval(typeTimer);
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-900/80 font-mono text-sm shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-800/80 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-red-500" />
        <span className="h-3 w-3 rounded-full bg-yellow-500" />
        <span className="h-3 w-3 rounded-full bg-green-500" />
      </div>
      <div className="min-h-[160px] p-4 text-zinc-200">
        <p>
          <span className="text-green-400">$</span> {typedCommand}
          {showCursor && <span className="animate-pulse">▍</span>}
        </p>
        {OUTPUT_LINES.slice(0, visibleLines).map((line) => (
          <p
            key={line}
            className={
              line.startsWith("✗")
                ? "text-red-400"
                : line.startsWith("✓")
                  ? "text-green-400"
                  : "text-zinc-300"
            }
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Temporarily render `<TerminalDemo />` under the Navbar in `app/page.tsx`, run `npm run dev`, open `http://localhost:3000`.
Expected: command types out character by character, then the 4 output lines appear one at a time (red ✗ lines, green ✓ line), cursor stops blinking after the last line.

- [ ] **Step 3: Commit**

```bash
git add components/TerminalDemo.tsx app/page.tsx
git commit -m "feat: add terminal typewriter animation component"
```

---

### Task 5: Hero section

**Files:**
- Create: `components/Hero.tsx`

**Interfaces:**
- Consumes: `TerminalDemo` (default export) from `components/TerminalDemo.tsx`.
- Produces: `Hero` component (default export), no props.

- [ ] **Step 1: Create the component**

Create `components/Hero.tsx`:

```tsx
import TerminalDemo from "@/components/TerminalDemo";

export default function Hero() {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-6 py-20 sm:grid-cols-2 sm:items-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Security scan built for apps you shipped fast with AI.
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          Secanix checks for the leaks that get missed when you&apos;re
          moving fast with Claude Code, Cursor, or v0 — exposed Supabase
          keys, missing API auth, disabled RLS, known CVEs.
        </p>
        <a
          href="#waitlist"
          className="mt-8 inline-block rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 hover:bg-white"
        >
          Get early access
        </a>
      </div>
      <TerminalDemo />
    </section>
  );
}
```

- [ ] **Step 2: Swap the temporary `TerminalDemo` mount in `app/page.tsx` for `<Hero />`**

Replace the direct `<TerminalDemo />` render added in Task 4, Step 2 with `<Hero />` (import from `@/components/Hero`), rendered under `<Navbar />`.

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: two-column hero on wide viewports (copy left, terminal right), stacked on narrow viewports, "Get early access" link present (target section doesn't exist yet — fine, added in Task 11).

- [ ] **Step 4: Commit**

```bash
git add components/Hero.tsx app/page.tsx
git commit -m "feat: add hero section"
```

---

### Task 6: Problem section

**Files:**
- Create: `components/ProblemSection.tsx`

**Interfaces:**
- Produces: `ProblemSection` component (default export), no props, section `id="problem"`.

- [ ] **Step 1: Create the component**

Create `components/ProblemSection.tsx`:

```tsx
const LEAKS = [
  "Supabase service role key shipped in the client bundle.",
  "Next.js API route with no auth check.",
  ".env committed to a public repo, or secrets hardcoded in source.",
  "Row-level security (RLS) disabled or misconfigured.",
  "CORS wildcard (*) left on in production.",
  "Dependencies with known CVEs that never got updated.",
  "No rate limiting on public endpoints.",
  "Debug or console logs leaking sensitive data.",
];

export default function ProblemSection() {
  return (
    <section id="problem" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
        The patterns that get missed when you&apos;re shipping fast
      </h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {LEAKS.map((leak) => (
          <li
            key={leak}
            className="rounded-md border border-white/10 bg-zinc-900/50 p-4 text-zinc-300"
          >
            {leak}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `app/page.tsx` after `<Hero />`**

Import and render `<ProblemSection />` under `<Hero />`.

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`, scroll down.
Expected: 8-item grid of leak patterns, 2 columns on wide viewports, `#problem` anchor reachable from the navbar link added in Task 3.

- [ ] **Step 4: Commit**

```bash
git add components/ProblemSection.tsx app/page.tsx
git commit -m "feat: add problem section"
```

---

### Task 7: "Why not just use your AI tool's own audit" section

**Files:**
- Create: `components/WhyNotAiAudit.tsx`

**Interfaces:**
- Produces: `WhyNotAiAudit` component (default export), no props.

- [ ] **Step 1: Create the component**

Create `components/WhyNotAiAudit.tsx` using the copy from `docs/02-marketing/positioning.md` ("Why not just use the audit your AI coding tool already has" section), close to verbatim:

```tsx
const POINTS = [
  {
    title: "The thing that wrote the bug is a bad judge of the bug.",
    body: "Claude Code, Cursor, v0 — whichever tool generated your app — checking its own output for security holes has the same blind spots that put the holes there in the first place. That's not a knock on the tool. It's just how self-review works, for humans or AI. Nobody skips code review because the author is smart.",
  },
  {
    title: "Your AI tool wants you to feel good about shipping. That's its job.",
    body: "It's not lying to you, but it's also not incentivized to slow you down with scary findings. A scanner that isn't selling you the platform doesn't have that conflict.",
  },
  {
    title: "You don't use one tool.",
    body: "Claude Code for the backend, v0 for the landing page, Cursor for the fix at 1am. Whatever audit each of those has (if any) doesn't talk to the others. One scanner that runs the same checks no matter what wrote the code is the only way to get a consistent answer.",
  },
  {
    title: "Pattern matching doesn't hallucinate.",
    body: "We run gitleaks, semgrep, osv-scanner — the same tools security teams have trusted for years — not an LLM prompted to \"check for security issues\" that might say something different every time you ask. Same input, same output, every run.",
  },
  {
    title: "It runs in your PR, not in a chat window you'll forget.",
    body: "A one-off \"looks good\" in a chat session disappears when you close the tab. A failing CI check blocks the merge and leaves a record of what got caught and when.",
  },
];

export default function WhyNotAiAudit() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
        &quot;My AI tool already checks this.&quot;
      </h2>
      <div className="mt-8 space-y-6">
        {POINTS.map((point) => (
          <div key={point.title}>
            <h3 className="font-semibold text-zinc-100">{point.title}</h3>
            <p className="mt-1 text-zinc-400">{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `app/page.tsx` after `<ProblemSection />`**

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`, scroll to this section.
Expected: 5 stacked title+body blocks, copy matches `positioning.md` verbatim.

- [ ] **Step 4: Commit**

```bash
git add components/WhyNotAiAudit.tsx app/page.tsx
git commit -m "feat: add why-not-AI-audit section"
```

---

### Task 8: How it works section

**Files:**
- Create: `components/HowItWorks.tsx`

**Interfaces:**
- Produces: `HowItWorks` component (default export), no props, section `id="how-it-works"`.

- [ ] **Step 1: Create the component**

Create `components/HowItWorks.tsx`:

```tsx
const STEPS = [
  {
    title: "Run it from your terminal",
    body: "npx secanix scan — no config, no account needed for the first run.",
  },
  {
    title: "Built on tools that already earned trust",
    body: "Composes gitleaks (secrets), semgrep (custom Next.js/Supabase rules), and osv-scanner (dependency CVEs) — not a reimplemented scanner.",
  },
  {
    title: "Wire it into CI",
    body: "Add the GitHub Action and every PR gets an automatic comment listing what changed and what's still open.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
        How it works
      </h2>
      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="rounded-md border border-white/10 bg-zinc-900/50 p-5"
          >
            <span className="font-mono text-sm text-zinc-500">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2 font-semibold text-zinc-100">{step.title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `app/page.tsx` after `<WhyNotAiAudit />`**

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`, scroll to this section, click the "How it works" navbar link.
Expected: 3-column numbered list, anchor link from navbar scrolls here correctly.

- [ ] **Step 4: Commit**

```bash
git add components/HowItWorks.tsx app/page.tsx
git commit -m "feat: add how-it-works section"
```

---

### Task 9: Pricing teaser section

**Files:**
- Create: `components/PricingTeaser.tsx`

**Interfaces:**
- Produces: `PricingTeaser` component (default export), no props, section `id="pricing"`.

- [ ] **Step 1: Create the component**

Create `components/PricingTeaser.tsx` (figures from `docs/01-product/pricing.md`):

```tsx
const TIERS = [
  {
    name: "Free",
    price: "$0",
    blurb: "One full scan, full report — not a teaser.",
  },
  {
    name: "Pro",
    price: "$15–25/mo",
    blurb: "CI integration, automatic PR comments, unlimited scans on one repo.",
  },
  {
    name: "Team",
    price: "$50–99/mo",
    blurb: "Multi-repo, priority rule updates, compliance-ready reports.",
  },
];

export default function PricingTeaser() {
  return (
    <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">Pricing</h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className="rounded-md border border-white/10 bg-zinc-900/50 p-5"
          >
            <h3 className="font-semibold text-zinc-100">{tier.name}</h3>
            <p className="mt-1 text-xl text-zinc-50">{tier.price}</p>
            <p className="mt-2 text-sm text-zinc-400">{tier.blurb}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `app/page.tsx` after `<HowItWorks />`**

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`, click "Pricing" in navbar.
Expected: 3-column tier grid, anchor scroll works, no checkout links present anywhere in the section.

- [ ] **Step 4: Commit**

```bash
git add components/PricingTeaser.tsx app/page.tsx
git commit -m "feat: add pricing teaser section"
```

---

### Task 10: Waitlist API route + Resend integration

**Files:**
- Create: `app/api/waitlist/route.ts`
- Test: `test/waitlist.test.ts`
- Modify: `package.json` (add `resend` dependency)

**Interfaces:**
- Consumes: env vars `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` (read at request time via `process.env`).
- Produces: `POST` handler exported from `app/api/waitlist/route.ts`, signature `(req: Request) => Promise<Response>`. Accepts JSON body `{ email: string, company?: string }`. Returns `200 { ok: true }` on success, `400 { error: string }` on invalid email or honeypot fill, `502 { error: string }` if Resend errors.

- [ ] **Step 1: Install the Resend SDK**

```bash
npm install resend
```

- [ ] **Step 2: Write the failing test**

Create `test/waitlist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/waitlist/route";

const createMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    contacts: { create: createMock },
  })),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  createMock.mockReset();
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_AUDIENCE_ID = "test-audience";
});

describe("POST /api/waitlist", () => {
  it("rejects an invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("rejects a honeypot-filled submission", async () => {
    const res = await POST(
      makeRequest({ email: "a@b.com", company: "bot-filled-this-in" }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("accepts a valid email and forwards it to Resend", async () => {
    createMock.mockResolvedValue({ data: { id: "1" }, error: null });
    const res = await POST(makeRequest({ email: "a@b.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(createMock).toHaveBeenCalledWith({
      email: "a@b.com",
      audienceId: "test-audience",
    });
  });

  it("returns 502 when Resend errors", async () => {
    createMock.mockResolvedValue({
      data: null,
      error: { message: "bad audience id" },
    });
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `app/api/waitlist/route.ts` does not exist yet (module not found).

- [ ] **Step 4: Implement the route**

Create `app/api/waitlist/route.ts`:

```ts
import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string; company?: string };
  const { email, company } = body;

  if (company) {
    return Response.json({ error: "rejected" }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid email" }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.contacts.create({
    email,
    audienceId: process.env.RESEND_AUDIENCE_ID as string,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 4 cases in `test/waitlist.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/api/waitlist/route.ts test/waitlist.test.ts package.json package-lock.json
git commit -m "feat: add waitlist API route backed by Resend"
```

---

### Task 11: WaitlistForm component + Footer

**Files:**
- Create: `components/WaitlistForm.tsx`
- Create: `components/Footer.tsx`

**Interfaces:**
- Consumes: `POST /api/waitlist` from Task 10 (request/response shape as defined there).
- Produces: `WaitlistForm` component (default export, client component, section `id="waitlist"`) and `Footer` component (default export).

- [ ] **Step 1: Create the waitlist form**

Create `components/WaitlistForm.tsx`:

```tsx
"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company }),
      });

      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <section id="waitlist" className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="text-lg text-zinc-100">You&apos;re on the list.</p>
      </section>
    );
  }

  return (
    <section id="waitlist" className="mx-auto max-w-5xl px-6 py-20 text-center">
      <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">
        Get early access
      </h2>
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          name="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-white/10 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 hover:bg-white disabled:opacity-60"
        >
          {status === "submitting" ? "Joining..." : "Join waitlist"}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-3 text-sm text-red-400">
          Something went wrong — try again in a bit.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create the footer**

Create `components/Footer.tsx`:

```tsx
export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
      <p>© {new Date().getFullYear()} Secanix.</p>
    </footer>
  );
}
```

- [ ] **Step 3: Mount both in `app/page.tsx` after `<PricingTeaser />`**

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000`, scroll to the waitlist form, submit a real email.
Expected: button shows "Joining...", then either the success message ("You're on the list.") if `RESEND_API_KEY`/`RESEND_AUDIENCE_ID` are set locally, or the red error message if they aren't set yet (502 from the route) — both are acceptable at this stage since Resend credentials are supplied later per the Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add components/WaitlistForm.tsx components/Footer.tsx app/page.tsx
git commit -m "feat: add waitlist form and footer"
```

---

### Task 12: Assemble the final page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Navbar`, `Hero`, `ProblemSection`, `WhyNotAiAudit`, `HowItWorks`, `PricingTeaser`, `WaitlistForm`, `Footer` — all default exports from their respective files under `components/`.

- [ ] **Step 1: Rewrite `app/page.tsx` as a clean composition**

By this point `app/page.tsx` has accumulated section mounts in commit order from Tasks 3–11. Replace its full contents with the final ordered composition:

```tsx
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import WhyNotAiAudit from "@/components/WhyNotAiAudit";
import HowItWorks from "@/components/HowItWorks";
import PricingTeaser from "@/components/PricingTeaser";
import WaitlistForm from "@/components/WaitlistForm";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <WhyNotAiAudit />
        <HowItWorks />
        <PricingTeaser />
        <WaitlistForm />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all `test/waitlist.test.ts` cases still PASS (page composition doesn't touch the API route).

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build completes with no type or lint errors.

- [ ] **Step 4: Full manual walkthrough**

Run: `npm run dev`, open `http://localhost:3000`.
Expected end-to-end check: navbar glass effect visible over hero on scroll, terminal animation plays once, all three navbar anchor links (`#problem`, `#how-it-works`, `#pricing`) scroll to the right section, waitlist form at the bottom submits without a JS error.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: assemble final landing page composition"
```

---

### Task 13: Deploy to Vercel (preview)

**Files:** none (deployment step, no repo changes beyond what's already committed).

**Interfaces:** none.

- [ ] **Step 1: Push the repo to GitHub**

Create a new GitHub repo (`secanix-landing`, can be private for now) and push:

```bash
git remote add origin https://github.com/cutryandifonna/secanix-landing.git
git push -u origin main
```

- [ ] **Step 2: Deploy via Vercel**

Use the `vercel:deploy` skill (or `vercel` CLI: `npx vercel --yes`) to create the Vercel project and deploy. When prompted for environment variables, leave `RESEND_API_KEY` and `RESEND_AUDIENCE_ID` unset for now (per Global Constraints — supplied later) or set them if already available.

- [ ] **Step 3: Verify the preview deployment**

Open the Vercel-provided preview URL.
Expected: page matches the local `npm run dev` walkthrough from Task 12, Step 4.

- [ ] **Step 4: Report the preview URL back to the user**

No commit — this is the final task; report the live preview URL as the plan's completion signal.
