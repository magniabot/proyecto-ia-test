# Account-Health Pre-Check Flow

Account-health is a **gate**, not a scored module. It runs first on every invocation (full, single-module, or partial multi-module). Read `account-health-rules.md` for thresholds.

## Inputs

`context/analysis/feed/module-scores.json` → `account_health`:

- `gate`: `pass | block | degraded | unknown`
- `available` / `total`: how many account-level resources returned (`available/total`)
- `blockers[]`, `notes[]`, `summary{}`

Source cache: `context/feed/cache/merchant-account-health.json` (read-only pulls of `accounts.issues`, `homepage`, `businessInfo`, `aggregateProductStatuses`, `programs`, `automaticImprovements`, `gbpAccounts`, `shippingSettings`).

## Procedure

1. **Read the gate.**
   - `block` → stop immediately, communicate the blocker to the user, and route to `/merchant-auth <client>` or the named setup actor. Write no report, log, module score file, or queues.
   - `degraded` with `available = 0` → stop immediately; the mandatory pre-check did not run. Refresh Merchant access/cache before analysis.
   - `degraded` with partial resources → continue; mark account-level statements limited-confidence.
   - `pass` → fold non-blocking `notes` into the Errors module narrative.
   - `unknown` → no account-health data pulled. This is only tolerable in dev/recovery; for normal runs, refresh before analysis.
2. **Cross-check disapprovals.** Compare `summary.aggregate_product_statuses.disapproved` against the Errors module's affected count. A large gap means the product pull and the account roll-up disagree — note it. (The roll-up sums across reporting contexts — Shopping + Display + Free listings — so the same product can be counted in more than one context.)
3. **Programs overview.** Read `summary.programs`. Confirm `shopping-ads` and `free-listings` are `ENABLED` (serving surfaces). `product-ratings: ENABLED` means product star ratings are live — the closest API signal to "do we have ratings" (there is no readable store-rating score). Mention `checkout`/youtube programs only if relevant to the client.
4. **Automatic improvements.** Read `summary.automatic_improvements`. Report which auto-edits Google is applying (price/availability/condition/image/shipping) as **context** — it explains feed drift and means some on-feed values are not merchant-authored. Alert the users on this, since it can be a silent thing in an account that has huge impact.
5. **GBP / local relevance.** Read `summary.gbp` and `context/business.md`.
   - If `gbp.linked === false` **and** business.md indicates local presence matters (physical stores, local pickup, "near me"/service-area intent, omnichannel), **highlight** the missing GBP link as an opportunity (local inventory ads, store visits, local/seller-rating signals).
   - If local is clearly irrelevant (pure online B2B/B2C shipping) just omit.
   - If GBP returned 401/unavailable, say "GBP link status needs admin access on the MC account — unavailable", do **not** assert it is unlinked.
6. **Shipping.** Read `summary.shipping`. No configured services → serving-readiness note (shipping config is required to serve in most markets).

## Do not

- Do not route a genuinely non-feed account to `/merchant-auth`; SKIP it.
- Do not block the product audit just because one account-level endpoint was unavailable. Partial `degraded` continues; zero available account-health resources stops.
