# Completeness Flow

Answers: **for this account's vertical(s), which expected attributes are present vs missing?** Presence only — value quality belongs to the Attributes module. 

Read `completeness-rules.md` and `vertical-attribute-matrix.md`.

## Inputs

- `module-scores.json` → `business_profile` (vertical distribution, classification source/confidence, EU/required-size market flags) and `modules[completeness]`: `score`, `findings_by_tier` (tier1 / tier2_enumerated / tier2_upside_summarized), `attribute_coverage[]`, `upside_summary[]`. **Read these directly — do not parse the queue CSV to recompute tier counts.**
- `context/analysis/feed/completeness-queue.csv` — per-product findings that have a per-product consumer: Tier-1 gaps (score-driving) and Tier-2 `optimizer:*` gaps. **Tier-2 advisory upside (content-maker / source-required / external) is NOT enumerated here** — it lives in `attribute_coverage` (the %) + `upside_summary` (count + route) + the advisory brief as one summary line per attribute. This keeps the queue actionable instead of ballooning to one identical row per product.
- `context/business.md` — the **pre-check**: read it first to learn the stated vertical(s) and ground the expected-attribute set.
- `context/google-ads/data/campaigns.csv` — read by the script for the `demand_gen_surface` gate: if any campaign is `DEMAND_GEN`, `VIDEO`, or `PERFORMANCE_MAX`, `short_title` + `lifestyle_image_link` become expected (Tier 2). Absent file → not expected (never flagged on missing data).

## Procedure

1. **Read `business.md` first.** It frames which verticals are in play. If it states a vertical, use it to confirm/adjust; if silent or missing, lean on the feed-derived classification (never hard-block).
2. **Read the detected profile** (`business_profile`): `vertical_distribution`, `classification_source`, `classification_confidence`. The script classifies each product by its **GPC top-level node** (numeric ids decoded via the Google taxonomy), falling back to `product_type`, else unclassified.
3. **Reconcile + confirm in one line.** If `business.md` and the feed materially conflict (a vertical with significant share that `business.md` doesn't mention), surface it rather than silently choosing, e.g.:
   > "business.md says {X}, but ~{N}% of products are {Y}-categorised — treat those as {Y}? I'll expect {…} and ignore {…}. Correct?"
   When confidence is `low`/`medium` (e.g. uniform GPC), say how the vertical was determined. **Irrelevant attributes are excluded from the score, not penalised.**
4. **Read coverage + tiers.** `attribute_coverage[]` lists per attribute: `tier`, `eligible`, `missing`, `coverage_pct`. **Tier-1 gaps drive the mechanical score; Tier-2 gaps are reported as upside** and folded into the narrative. For Tier-2 upside, report the coverage % and `upside_summary` counts (e.g. "product_highlight present on 0% — `/feed-optimizer content` opportunity") rather than listing products — a `missing` count of N across an `always`-relevant attribute is a single coverage statement, not N findings.
5. **Fixability split** from `completeness-queue.csv`:
   - `optimizer:derivable` → value parseable from title/description/another attribute → `/feed-optimizer small-attributes` (constrained attributes) or `product-type` (when GPC exists).
   - `optimizer:strategy` → CSV-doable but needs a taxonomy decision → `/feed-optimizer product-type` / `taxonomy`.
   - `content-maker` → missing free-text (title/description, plus `product_highlight`/`product_detail`/`short_title`) → `/feed-optimizer content`.
   - `source-required` / `external` → value exists nowhere / needs an external actor → advisory brief.
6. **Finalise fixability and write it back.** Review the script's provisional classes per `fixability-classes.md` (e.g. a "derivable" color that is only in another language stays derivable; an ambiguous size downgrades to `source-required`). Rewrite the affected rows in `completeness-queue.csv` — `fixability_class` and `recommended_downstream` (canonical tokens only) — before sequencing handoffs; the optimizer reads the CSV, not the report.
7. **Handoff.** Derivable/strategy gaps → `/feed-optimizer` (cite the action); missing free-text → `/feed-optimizer content`; source-required/external → `completeness-advisory-brief.md`.

## Account-agnostic guardrails

- Never assume a vertical. A product with no positive vertical signal expects only the hard-required base fields.
- A simple single-vertical store can legitimately be `strong`.
- Hard-required fields already flagged by Merchant are owned by the Errors module (error-lane-wins dedup) — Completeness covers the gaps Google has **not** flagged yet.
