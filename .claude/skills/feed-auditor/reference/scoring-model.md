# Feed Auditor - Scoring Model

Scripts calculate deterministic mechanical score inputs (`context/analysis/feed/module-scores.json`). Claude writes the final score narrative and may adjust module status only by the documented rules below.

The auditor runs as **selectable modules** (Mode B). Each module scores **0-100 independently**. A full run also produces a **weighted combined 0-100 score**.

## Modules and weights

| Module | Token | Weight (combined) | Scored |
|---|---|---:|---|
| Error checker | `errors` | 30 | yes |
| Completeness | `completeness` | 25 | yes |
| Attribute analyser | `attributes` | 20 | yes |
| Title & Description | `title-desc` | 15 | yes |
| Images | `images` | 10 | yes |
| Performance | `performance` | — | **deferred** |
| Account-health | (gate) | — | not scored (pre-check gate) |

Weights sum to 100 across the five active modules. **Performance is deferred and excluded from the combined denominator** until its design is finalised (open item in the plan).

## Per-module score (mechanical)

Each module score is account-relative:

```
score = round(100 * (1 - affected_products / eligible_products))
```

- `eligible_products` = the count of products for which the module is **relevant**, not the whole catalog. When nothing is eligible the module is **not applicable** (`score = null`) and is excluded from the combined score.
- Completeness scores only against **conditionally-required** relevant attributes (recommended-attribute gaps are reported but do not drive the score).
- Attributes scores only over products where the attribute is **present**.

## Run labels

`module-scores.json.run` has three values:

- `full` — all active scored modules ran.
- `single` — exactly one module ran.
- `partial` — two or more modules ran, but not every active scored module.

## Combined vs scoped score

For `full`, `combined_score` is the weighted average over scored modules that ran and are applicable (`score !== null`), renormalised so deferred/N-A modules do not drag the result:

```
combined = round( Σ(weight_i * score_i) / Σ(weight_i) )   over applicable scored modules
```

For `single` and `partial`, `combined_score = null` because full feed coverage did not run. Use `scoped_score` only as a selected-module summary; do not present it as the full feed score.

A single-module run reports that module's score as the headline. A partial multi-module run reports selected module scores and may mention `scoped_score` as scoped coverage only.

## Status bands

- `strong`: score ≥ 90
- `watch`: 70-89
- `weak`: 50-69
- `blocked`: < 50, or hard-gated by setup/account-health/measurement evidence
- `not-applicable`: module not relevant for this account (`score = null`)

## Account-health gate (pre-check)

Read `module-scores.json.account_health`:

- `gate: block` → hard blocker (unclaimed homepage, CRITICAL/suspended account issue). Stop immediately, communicate the blocker, route to `/merchant-auth <client>` or the setup actor, and write no analysis files.
- `gate: degraded` with `available = 0` → mandatory pre-check unavailable. Stop and refresh setup/cache before analysis.
- `gate: degraded` with partial resources → continue the product audit; note account-health as limited-confidence.
- `gate: pass` → fold non-blocking account notes into the Error module narrative.
- `gate: unknown` → no account-health data pulled. Normal runs must refresh before analysis; only dev/recovery contexts may continue.

## Allowed Claude adjustments

- **SKIP** non-feed accounts with a clear SKIP report (never route to `/merchant-auth` for a genuinely non-feed account).
- **Setup-block** configured/selected feed surfaces when Merchant API or Google Ads API access is unavailable, or account-health `gate: block`.
- **Exclude irrelevant attributes** from Completeness when business context (business.md + user confirmation) says they do not apply — do not penalise their absence.
- **Performance** stays deferred/excluded; do not invent a performance score.
- **Lower confidence** on any module when the underlying evidence is thin (e.g. tiny catalog, missing tracking for performance context).

Any adjustment must cite the rule used and the evidence file or peer report that triggered it.
