# Feed Auditor - Synthesis Playbook

How Claude turns mechanical module evidence into the final report. Read `context/analysis/feed/module-scores.json` first, then load only the per-module references for modules that ran and have findings.

## Inputs

- `context/analysis/feed/module-scores.json` — run label, per-module scores, bands, account-health gate, full `combined_score` (full runs only), `scoped_score`, feed profile, attribute coverage.
- `context/analysis/feed/{module}-queue.csv` — product-level findings + fixability per module.
- `context/analysis/feed/{module}-advisory-brief.md` — human/source actions (when present).

## Cascade order

Walk the feed cascade. Fixes lower in the cascade cascade up.

1. **Account-health gate** (setup) — if `gate: block`, `unknown` in a normal run, or zero resources available, stop and route to `/merchant-auth` / refresh setup. No product module audit happened.
2. **Errors** — flagged eligibility issues; a disapproved product earns nothing regardless of content.
3. **Completeness** — relevant attributes present.
4. **Attributes** — present attributes correct/structured.
5. **Title & Description** — free-text quality.
6. **Images** — coverage + flagged image issues.
7. **Performance** — deferred.

The **top hypothesis** is the highest active cascade layer that materially constrains lower work — usually the lowest-scoring high-cascade module, not simply the lowest score. Do not lead with row counts when a higher-layer blocker explains the account.

## Per-module vs combined

- **Single-module run (`run: single`):** report only that module — its score, band, findings, fixability split, queue, brief, and the one-line handoff. Still surface the account-health gate. Do not imply full feed coverage.
- **Full run (`run: full`):** report the full `combined_score` + every module, organised by cascade, with the top hypothesis and a sequenced handoff plan.
- **Partial multi-module run (`run: partial`):** report only the selected modules, ordered by the cascade, not by user argument order. `combined_score` should be null; if you mention `scoped_score`, label it as selected-module coverage only. Mention higher unselected layers only as not assessed when that caveat matters.

## Fixability split → handoffs

For each module, summarise findings by `fixability_class`:

- `optimizer:*` → sequence into `/feed-optimizer` (cite the action from `recommended_downstream`).
- `content-maker` → sequence into `/feed-optimizer content`.
- `source-required` / `external` → point to the module's advisory brief; these are human/source actions, not skill handoffs.

Before sequencing: finalised fixability must already be **written back to the queue CSVs** (see `fixability-classes.md`) — the optimizer consumes the CSVs, not this report. Every `recommended_downstream` token must be `feed-optimizer:{product-type|taxonomy|custom-label|small-attributes|content}` or `advisory-brief`; anything else means the contract drifted — fix the queue before handing off.

## Account-relative judgment (account-agnostic)

- Never assume a vertical. Use the `business_profile` in `module-scores.json` (vertical distribution, classification source/confidence, apparel/branded/variant shares, markets) plus `business.md` to confirm which attributes are relevant.
- Confirm the **expected-attribute set** with the user when feed classification is low/medium confidence or conflicts with `business.md`. Exclude irrelevant attributes from the score.
- Small/simple catalogs are not penalised for absent complexity (a 1-campaign single-category store can legitimately score `strong` everywhere).

## Confidence

- Performance context (hero/villain labels) is directional unless a fresh tracking report exists; never present it as fact when tracking is unverified.
- Account-health partial `degraded` → mark account-level statements limited-confidence. `unknown` is only for dev/recovery; normal runs refresh before analysis.
- State what you could **not** assess (image visual quality is metadata-only; price competitiveness is out of scope → future skill).

## Anti-patterns

- Do not let `analyze.js` output become the final report.
- Do not bulk-load source SOP material at runtime.
- Do not write a diagnostic-list-first report.
- Do not recommend a peer audit when a fresh peer report already answers the question.
- Do not leave a finalised fixability override only in the markdown report — write it back to the module queue CSV.
- Do not claim visual image quality beyond metadata or Merchant diagnostics.
- Do not present the deferred performance labels as a static upload plan.
- Do not route every account to strategy or tracking by default.
