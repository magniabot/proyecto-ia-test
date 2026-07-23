# Error Checker Flow

Answers: **what has Merchant/Google already flagged?** Owns flagged item-level issues. Per the error-lane-wins dedup rule, a flagged problem belongs here, not to Completeness. Read `errors-rules.md`.

## Inputs

- `context/analysis/feed/errors-queue.csv` — one row per flagged finding with `fixability_class`.
- `module-scores.json` → `modules[errors]` (score, band, eligible, affected).

## Procedure

1. **Score & band** from `module-scores.json`. Eligible denominator = all products (any product can be flagged).
2. **Fixability split.** Group `errors-queue.csv` by `fixability_class`:
   - `external` / `source-required` → the dominant case. Summarise by actor (policy, website/dev, source feed, designer) → `errors-advisory-brief.md`.
   - `optimizer:strategy` (e.g. wrong `google_product_category`/`product_type` flagged) → route to `/feed-optimizer taxonomy`.
   - `content-maker` (title/description policy length issues) → route to `/feed-optimizer content`.
3. **Finalise fixability and write it back.** The script's classification is keyword-based and provisional — refine it per `fixability-classes.md` (e.g. a disapproval stamped `external` that is actually a missing attribute a CSV can supply → upgrade to `optimizer:*`). Rewrite the affected rows in `errors-queue.csv` (`fixability_class` + `recommended_downstream`, canonical tokens only); the optimizer reads the CSV, not the report.
4. **Cascade priority.** Errors sit highest in the active cascade: a disapproved product earns nothing regardless of content quality. If Errors is `weak`/`blocked`, it is usually the top hypothesis.
5. **Handoff.** Lead with the advisory brief (most disapprovals need source/site/policy fixes), then the optimizer-able subset.

## Do not

- Do not imply `/feed-optimizer` can clear a policy strike or a price/website mismatch.
- Do not re-list the same product under Completeness (error-lane-wins).
