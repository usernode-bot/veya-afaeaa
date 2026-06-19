# Veya — notes for Claude Code

This app runs on **Usernode Social Vibecoding**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://social-vibecoding.usernodelabs.org/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Usernode's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About Veya

Veya is a wallet-first onchain social + DeFi + futures trading platform
inspired by Base App, Hyperliquid, and Farcaster. It combines a 6-tab
social/trading SPA with: perpetual futures markets (paper + live), a
prediction market engine, staking/LP/ICO earn features, identity
verification (3-tier: Basic wallet → Social via Base Verify → Premium
via zkPassport), and a comprehensive admin panel.

The primary URL is hash-routed (`#home`, `#trade`, `#futures`,
`#earn`, `#predict`, `#explore`). Admin lives at `/admin/*` and is
server-rendered with a light theme.

## App-specific conventions

- All currency/price values stored as `NUMERIC` in PostgreSQL, never as
  floating-point JS numbers — always `parseFloat()` before arithmetic.
- Futures liquidation price formula: `entry - (margin / size / leverage)`
  for longs, `entry + (margin / size / leverage)` for shorts.
- Tier hierarchy: `basic` < `social` < `premium`. Server always reads
  tier from `user_verifications.tier`, never from client input.
- The following tables are marked `staging:private` and will be empty
  in staging unless seeded: `staking_positions`, `lp_positions`,
  `ico_participations`, `stock_positions`, `stock_trades`,
  `futures_positions`, `futures_orders`, `futures_funding_payments`,
  `user_verifications`, `zkpassport_requests`, `audit_logs`,
  `idempotency_keys`.
- `@zkpassport/sdk` is imported with a try/catch — if the package
  install fails or ZKPASSPORT_DOMAIN is unset, all passport endpoints
  return `{ status: 'coming_soon' }`.
- Do not add new npm dependencies without updating `package.json`.
- Avoid adding new CDN script tags beyond the four already in
  `index.html` (Tailwind, Lightweight Charts, Chart.js, bridge).
