---
name: feed-auditor
description: >
  Audit Merchant Center product feed health as selectable, independently-scored modules
  (errors, completeness, attributes, title-desc, images) plus an account-health pre-check,
  from read-only Merchant API and Google Ads product evidence.
argument-hint: "[errors|completeness|attributes|title-desc|images|full]"
---

# Feed Auditor

Diagnose-only product feed audit. Read-only: never mutate Merchant Center, Google Ads, Channable, supplemental feeds, source feeds, or ecommerce platforms.

Scripts pull evidence and calculate mechanical module inputs. Claude writes the final judgment, report, confidence notes, and handoff sequence from `reference/`.

## Dispatch

No silent full runs.

```text
/feed-auditor                  -> ask which module(s) to run
/feed-auditor full             -> full run: all active modules + full combined score
/feed-auditor errors           -> single-module run
/feed-auditor completeness     -> single-module run
/feed-auditor attributes       -> single-module run
/feed-auditor title-desc       -> single-module run
/feed-auditor images           -> single-module run
/feed-auditor errors,images    -> partial multi-module run
```

If no argument was supplied, ask:

```text
Run `full`, one module (`errors`, `completeness`, `attributes`, `title-desc`, `images`), or several modules?
```

Account-health always runs as the setup gate.

## Shared Preflight

1. **Applicability.** Continue for feed, Shopping, PMax feed, Merchant, or product-feed evidence. If clearly non-feed, stop with SKIP and do not route to `/merchant-auth`. If ambiguous, ask whether this account has a Merchant/product feed surface.
2. **Config.** Read `config/ads-context.config.json`; require `googleAds.customerId`, `merchantCenter.enabled === true`, and `merchantCenter.accountId`. If missing for an applicable feed account, stop and route to `/merchant-auth <client>`.
3. **Pull foundation evidence.** Run once for every mode:

   ```bash
   node .claude/skills/feed-auditor/scripts/pull-data.js \
     --period={period} [--feed-label={label}] [--country={country}] [--language={language}] [--refresh]
   ```

   Reuse a complete <24h foundation cache unless `--refresh` is needed. If any required foundation artifact is missing, refresh rather than using a partial cache. If API validation fails, stop and route to `/merchant-auth <client>`.
4. **Main-market check.** Read `by_target_country` in `context/feed/cache/pull-summary.json`. If the feed spans more than one target country with a material share **and** no `--country` was supplied, the "main market" is ambiguous — and market-gated checks (apparel size/gender requirements, EU energy/unit-pricing rules) depend on it. Ask the user which country is the main market before scoring, e.g.:

   ```text
   This feed serves {countries with product counts}. Which is the main market for this audit, or
   should I run across all? I can scope the pull with --country={CODE}.
   ```

   A single-country feed needs no question. When the user names a main market, re-pull with `--country={CODE}` (or note the chosen market and keep the full pull). Never silently assume one country drives the others.
5. **Account-health gate.** If `gate: block`, or account-health resources are unavailable, stop before module analysis and communicate the blocker. `degraded` with partial resources may continue with limited confidence.

## Run Recipes

### Full Run

Use only when the user explicitly supplied `full`.

1. Run shared preflight.
2. Run module prep for all active modules in cascade order.
3. Analyze all active modules:

   ```bash
   node .claude/skills/feed-auditor/scripts/analyze.js --module=full
   ```

4. Read `context/analysis/feed/module-scores.json`.
5. Load shared references plus per-module references for modules that ran and have findings.
6. Write `context/analysis/feed-audit.md` and append `context/analysis/feed-audit-log.md`.
7. Report the full combined score, top cascade hypothesis, and sequenced handoff plan.

Allowed pauses during a full run:

- Completeness/Attributes: pause only when `business.md` conflicts with detected feed verticals or classification confidence is low.
- Images is **not** a pause: Claude runs `probe-images.js --visual` (Tier-1 + Tier-2 download) automatically, then inspects the downloaded images.

### Single-Module Run

Use for exactly one module token.

1. Run shared preflight.
2. Run only that module's prep.
3. Analyze only that module:

   ```bash
   node .claude/skills/feed-auditor/scripts/analyze.js --module={module}
   ```

4. Read `module-scores.json`; use the selected module's score as the headline.
5. Load shared references plus only that module's references.
6. Write `context/analysis/feed-{module}-audit.md` and append the audit log.
7. Offer only the scoped handoff for that module. Do not imply full feed coverage.

### Partial Multi-Module Run

Use for two or more module tokens, but not `full`.

1. Run shared preflight once.
2. Run selected modules in cascade order, regardless of argument order.
3. Run prep only for selected modules.
4. Analyze selected modules:

   ```bash
   node .claude/skills/feed-auditor/scripts/analyze.js --module={comma-separated-modules}
   ```

5. Read `module-scores.json`; report this as scoped coverage, not a full audit.
6. Load shared references plus selected module references.
7. Write `context/analysis/feed-partial-audit.md` and append the audit log.
8. Report selected module scores, scoped top hypothesis, and scoped cascade handoffs. Do not report a full combined score.

## Cascade

Run and report selected modules in this order:

1. Account-health gate
2. `errors`
3. `completeness`
4. `attributes`
5. `title-desc`
6. `images`

The top hypothesis is the highest active layer that materially constrains lower work, not simply the lowest numeric score.

## Module Prep

| Module | Prep before `analyze.js` | Reference files |
|---|---|---|
| account-health | Shared preflight only | `reference/account-health/account-health-flow.md` |
| `errors` | None beyond shared preflight | `reference/errors/*` |
| `completeness` | Read `context/business.md`; confirm expected attributes only on conflict/low confidence. |
| `attributes` | Read `context/business.md`; confirm relevance only on conflict/low confidence | `reference/attributes/*` |
| `title-desc` | For localized feeds, maintain runtime language patterns when needed | `reference/title-desc/*` |
| `images` | Always run the image probe (Tier-1 + Tier-2) — see below | `reference/images/*` |


Always load:

- `reference/scoring-model.md`
- `reference/fixability-classes.md`
- `reference/synthesis-playbook.md`
- `reference/report-template.md`
- `reference/handoff-matrix.md`

## Boundaries

- Merchant API is read-only; do not use non-GET Merchant calls.
- Do not use Content API for Shopping / `ShoppingContent.*`.
- Do not depend on `gads-context` freshness or field coverage.
- Performance is deferred and excluded from full combined scoring.
- Price competitiveness, promotions, and sale-price effectiveness are out of scope.
- Product-level detail lives in queue CSVs. Markdown reports stay cluster-level.
- Fixability routing comes from `fixability_class`: `optimizer:*` to `/feed-optimizer` (`product-type`, `taxonomy`, `custom-label`, `small-attributes`); `content-maker` to `/feed-optimizer content`; `source-required`/`external` to advisory brief, not a skill route.
- The queue CSVs are the machine handoff `/feed-optimizer` reads. When Claude finalises a fixability class differently from the script's provisional stamp, rewrite the affected queue rows (`fixability_class` + `recommended_downstream`) — a correction that lives only in the report does not reach the optimizer.

## Stable Outputs

```text
context/feed/cache/raw-merchant-products.json
context/feed/cache/merchant-products-normalized.{json,csv}
context/feed/cache/merchant-account-health.json
context/feed/cache/google-ads-shopping-product-status.csv
context/feed/cache/google-ads-shopping-performance.csv
context/feed/cache/pull-summary.json
context/feed/cache/image-probe.json                  (images Tier 1, when run)
context/feed/cache/image-visual-queue.json           (images Tier 2, when run)
context/feed/cache/images/<product_id>.<ext>         (Tier-2 downloads, when run)
context/feed/cache/title-desc-language-patterns.json (optional runtime hints)
context/feed/cache/feed-lexicons.json                (optional: Claude-authored promo/boilerplate words for uncovered languages)

context/analysis/feed/module-scores.json
context/analysis/feed/{errors,completeness,attributes,title-desc,images}-queue.csv
context/analysis/feed/title-desc-clusters.json       (title-desc, when run)
context/analysis/feed/title-desc-brief.md            (title-desc, when run)
context/analysis/feed/{module}-advisory-brief.md     (when applicable)
context/analysis/feed/feed-audit-evidence-summary.{json,md}
context/analysis/feed-audit.md                       (full run)
context/analysis/feed-{module}-audit.md              (single-module run)
context/analysis/feed-partial-audit.md               (partial multi-module run)
context/analysis/feed-audit-log.md
```
