# License-key verification (Pro tier gate) — design

Status: approved by user 2026-08-22, pending final spec review.

## Context

Pro tier (`docs/01-product/pricing.md`) is the customer-facing GitHub
Action (`action.yml`, tag `v1`) — auto PR comment + fail-CI-on-critical.
Payment provider decided earlier: LemonSqueezy (Merchant of Record,
License Key API) — see `project_payment_provider` memory. Zero
billing/gating code exists as of `secanix@0.1.3`: the Action runs for
anyone who installs it, free or not. This doc covers adding the
license check that gates it.

Free CLI (`npx secanix`) is explicitly **not** touched by this work —
it stays full-report, no license required, per the project's earlier
"don't teaser the free scan" decision (pricing.md/funnel.md).

## Decisions locked in during brainstorming

- **What gets gated**: the entire Action (install steps + scan +
  comment), not just the PR-comment step. Rationale: a user who wants
  the scan for free already has it — `npx secanix` as a manual CI step
  is free and full-detail today. The packaged Action's actual product
  is the convenience (auto-install scanners, auto-comment,
  auto-fail-on-critical) — that convenience is what's paid for. A
  half-working Action (scans but never comments) would confuse
  non-subscribers without improving conversion.
- **Fail-closed vs fail-open, split by cause**:
  - License key missing or invalid/expired → **fail-closed**. Job
    stops before any scanner install, with a clear upgrade message.
    Missing key is treated identically to invalid — not a third state.
  - LemonSqueezy API unreachable (network error, 5xx, malformed
    response) → **fail-open**. Not the customer's fault and not a
    licensing judgment — continue the scan/comment as normal, emit a
    warning annotation.
- **Validation method**: LemonSqueezy License API `POST
  /v1/licenses/validate` (public endpoint, `license_key` only) — no
  Store API key, no instance activation/binding. Rejected
  `/v1/licenses/activate` + instance tracking: it would consume
  `activation_limit` slots on every CI run and require storing a
  second secret (`instance_id`) customer-side, for no validated need.
  Explicit accepted trade-off: one license key can be reused across
  multiple repos undetected (no per-seat enforcement) — YAGNI until
  real abuse is reported.
- **Where the logic lives**: a new CLI subcommand, not inline
  bash/curl in `action.yml`. Keeps it inside the existing
  TypeScript+vitest test surface (same pattern as all 6 existing
  checks), keeps error-message formatting consistent, and stays
  reusable if the CLI itself ever needs a Pro-status check outside the
  Action.
- **Env var name**: `SECANIX_LICENSE_KEY` — decoupled from the payment
  provider's name so a future provider switch doesn't require
  customers to rename their GitHub secret.
- **Store API key is out of scope for this feature.** The Store API
  key the user copied when registering LemonSqueezy is a *different*
  credential (Bearer-auth, used for store/product/order management)
  from the license-key validate flow, which needs no auth at all.
  It must never be placed in `action.yml` or any customer-facing
  artifact — doing so would leak a store-wide secret to every
  installer of the public Action. Nothing in this feature uses it.

## Architecture

```
action.yml (composite)
  → checkout
  → download pinned secanix CLI
  → run `secanix license-check` step (NEW, first, before scanner installs)
      reads secrets.SECANIX_LICENSE_KEY
      exit 0 → continue
      exit 1 → core.setFailed, stop (fail-closed)
      exit 2 → warning annotation, continue (fail-open)
  → (unchanged) install gitleaks/semgrep/osv-scanner
  → (unchanged) run scan --json
  → (unchanged) parse/build/post-or-update PR comment
  → (unchanged) core.setFailed on critical finding
```

## Components

### 1. `src/licenseCheck.ts` (new)

Pure async function, same shape/testability pattern as the existing
check modules:

```ts
type LicenseCheckResult =
  | { status: "valid" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

async function checkLicense(key: string | undefined): Promise<LicenseCheckResult>
```

- `key` undefined/empty → `{ status: "invalid", message: "..." }`
  immediately, no network call (missing key is not a network case).
- Otherwise `POST https://api.lemonsqueezy.com/v1/licenses/validate`,
  body `license_key=<key>` (form-encoded, per LemonSqueezy's documented
  content type), explicit fetch timeout (`AbortSignal.timeout(10_000)`
  — Node 18+ has this natively, no new dependency).
- Response `valid: true` → `{ status: "valid" }`.
- Response reaches LemonSqueezy but says invalid/expired/disabled →
  `{ status: "invalid", message: <their error string or a default> }`.
- Network error, timeout, non-2xx unrelated to key validity, or
  JSON parse failure → `{ status: "error", message: <cause> }`.

### 2. CLI subcommand (`src/cli.ts`)

`secanix license-check` — reads `process.env.SECANIX_LICENSE_KEY`
(no positional-arg key input needed; this is invoked by the Action,
not typed by end users), calls `checkLicense`, prints one line to
stdout/stderr, maps result to process exit code:

- `valid` → exit 0
- `invalid` → exit 1
- `error` → exit 2

### 3. `action.yml`

New step inserted immediately after checkout / CLI download, **before**
the gitleaks/semgrep/osv-scanner install steps (fail fast — don't
spend a non-subscriber's runner time installing scanners they won't
get results from):

```yaml
- name: Check Pro license
  id: license
  shell: bash
  run: |
    node .../dist/cli.js license-check
    echo "exit=$?" >> "$GITHUB_OUTPUT"
  continue-on-error: true   # so we can branch instead of hard-failing here
- name: Stop if license invalid
  if: steps.license.outputs.exit == '1'
  run: |
    echo "::error::secanix Pro license invalid or missing. Subscribe at secanix.com/pricing and set the SECANIX_LICENSE_KEY repo secret."
    exit 1
- name: Warn if license check unreachable
  if: steps.license.outputs.exit == '2'
  run: echo "::warning::Could not verify secanix Pro license (LemonSqueezy unreachable) — continuing scan."
```

(Exact composite-action step wiring to be finalized during
implementation; the contract that matters is the 0/1/2 exit codes and
the fail-closed/fail-open split above.)

## Data flow

PR opened/updated → Action triggers → checkout → download pinned
secanix → `license-check` runs → branch on exit code → (if not
fail-closed) install scanners → run scan → post/update PR comment →
`core.setFailed` on critical finding (unchanged, existing behavior).

## Error handling

- Missing/empty `SECANIX_LICENSE_KEY` secret → treated as `invalid`
  (exit 1), same fail-closed path as a wrong key. No separate
  "not configured" message needed beyond the standard invalid message.
- Fetch timeout (10s) → `error` (exit 2, fail-open) — don't hang a
  customer's CI on a third-party outage.
- Malformed/non-JSON response body → `error` (exit 2).
- LemonSqueezy responds but the shape is unexpected (e.g. API version
  change) → treat as `error`, not `invalid` — never silently
  fail-closed on a response-shape assumption that turns out wrong.

## Testing

- Unit tests (vitest, mock global `fetch`), mirroring the existing
  check test files: valid response, invalid/expired response, network
  error (fetch throws), malformed JSON, missing key (no fetch call at
  all — assert `fetch` was never invoked).
- Manual real verification before commit (per project's standing
  practice of exercising the built CLI for real, not just unit tests):
  generate a LemonSqueezy **test-mode** license key, run `secanix
  license-check` against it directly (valid key, deliberately wrong
  key, empty env var) and confirm exit codes 0/1/1.
- Action end-to-end verification: open a real PR against a scratch/test
  repo with the Action installed and `SECANIX_LICENSE_KEY` set to the
  test-mode key, confirm the job passes and comments; then repeat with
  the secret removed and confirm the job fails closed with the
  upgrade message. Mirrors how the original Action was validated
  (real PR opened/verified/closed), not just YAML review.

## Out of scope (this pass)

- Per-seat/instance enforcement (`/v1/licenses/activate` +
  `instance_id` tracking) — revisit only if key-sharing abuse is
  actually reported.
- Any gating inside the free CLI (`npx secanix`) itself — stays
  ungated, full-report, per existing pricing/funnel decisions.
- Using the LemonSqueezy Store API key for anything (subscription
  status lookups, usage dashboards, etc.) — separate future work, not
  needed for this gate.
- Configurable license-check behavior (e.g. an opt-out flag) — one
  fixed policy for now, consistent with the Action's existing
  non-configurable fail-on-critical policy.
