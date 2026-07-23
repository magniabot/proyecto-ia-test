# Account-Health Rules

Read-only account-level Merchant resources (new Merchant API, `merchantapi.googleapis.com`):

All endpoints use Merchant API **v1** (stable).

| Resource | Endpoint | Used for |
|---|---|---|
| Account issues | `accounts/v1/accounts/{id}/issues` | Account-level problems (closest to "store quality") |
| Homepage | `accounts/v1/accounts/{id}/homepage` | Website claim status |
| Business info | `accounts/v1/accounts/{id}/businessInfo` | Address / contact completeness |
| Aggregate product statuses | `issueresolution/v1/accounts/{id}/aggregateProductStatuses` | Approved/pending/disapproved roll-up |
| Programs | `accounts/v1/accounts/{id}/programs` | Which surfaces are ENABLED (shopping-ads, free-listings, product-ratings, checkout, …) + per-program `unmetRequirements` |
| Automatic improvements | `accounts/v1/accounts/{id}/automaticImprovements` | Whether Google auto-edits the feed (price/availability/condition/image/shipping) |
| GBP accounts | `accounts/v1/accounts/{id}/gbpAccounts` | Whether a Google Business Profile is linked (local/seller-rating signal source) — **requires admin access on the MC account**; returns 401 for sub-users |
| Shipping settings | `accounts/v1/accounts/{id}/shippingSettings` | Configured shipping services / warehouses (serving requirement in most markets) |

> **No store/seller rating endpoint exists.** The aggregate Seller/Store star rating is computed by Google and shown only in the Merchant Center UI / Seller Ratings extension — it is not exposed by the API. The `reviews.merchantReviews` / `reviews.productReviews` resources are *upload* endpoints (the merchant feeds review content **to** Google), not a way to read the rating. The closest API-native signal is the `product-ratings` **program state** (ENABLED ⇒ product ratings are live), not the score.

## Gate rules

- **block** when:
  - homepage `claimed === false`, or
  - an account issue has severity matching `CRITICAL | SUSPEND | DISAPPROV` (account suspended / serving blocked).
- **degraded** when one or more non-blocking resources are unavailable.
- **pass** otherwise.
- **unknown** when no `merchant-account-health.json` exists.
- **Stop before analysis** when `block`, `unknown` in a normal run, or `degraded` with `available = 0`.

Programs/shipping are **overview/context signals, not hard blockers** — a non-ENABLED core program or missing shipping is surfaced as a prominent note, left to Claude's judgment, not an automatic `block`.

## Notes (non-blocking)

- Non-critical account issues → list (cap ~10) with severity.
- Missing business address → trust/store-quality note.
- Aggregate `disapproved > 0` → cross-check note against the Errors module.
- **Programs:** `shopping-ads`/`free-listings` not `ENABLED` → serving-surface note. `unmetRequirements` are only flagged for **non-ENABLED** programs (an ENABLED program's unmet requirements are non-served expansion regions, e.g. a Korea-only requirement for a NL merchant — noise).
- **Automatic improvements:** report which auto-edits are active as context (explains feed drift).
- **GBP not linked / unavailable:** neutral fact by default. See the flow doc — elevate to a highlight only when `business.md` shows local presence matters. A 401 means the token's user is not an account admin; report as "unavailable (needs admin access)", do not assert "not linked".
- **Shipping:** no configured services → serving-readiness note.

## Account-agnostic guardrails

- Endpoint shapes vary by API version/account; the interpreter reads fields defensively and records unavailability rather than failing.
- Never assert an account-level fact from an unavailable resource — say "unavailable" instead.
