# Attribute Analyser Flow

Answers: **are the attributes that are present correct & well-structured?** 


Validates the quality of **every Data-Spec attribute this module owns** (see `attributes-rules.md` for the owned set), present-only. Never flags a blank attribute except dependency-integrity (a present attribute whose required companion is missing). Findings route on **two lanes** by fixability: 

CSV-fixable → `/feed-optimizer`; 

not-fixable → an **advisory brief**. 

Read `attributes-rules.md` and `attribute-validation-catalog.md`.

## Inputs

- `module-scores.json` → `modules[attributes]` (score, band, eligible, affected).
- `context/analysis/feed/attributes-queue.csv` — per-product findings with `fixability_class`, `recommended_downstream` (the optimizer action, e.g. `feed-optimizer:small-attributes`), `severity` (critical/important/recommended/optional), and `confidence`.
- `context/analysis/feed/attributes-advisory-brief.md` — written when there are `source-required`/`external` findings, grouped by the actor who must act.

## Procedure

1. **Score & band.** Eligible denominator = products with at least one owned attribute present. Score is binary `1 − affected/eligible`.
2. **Order by severity, then group by lane** (`attributes-queue.csv`):
   - **CSV-fixable → `/feed-optimizer`** (cite the action from `recommended_downstream`):
     - `product_type` flat/shallow/over-length → `optimizer:strategy` → `/feed-optimizer product-type`.
     - `google_product_category` non-canonical → `optimizer:strategy` → `/feed-optimizer taxonomy`.
     - `custom_label_*` low-quality/over-length → `optimizer:strategy` → `/feed-optimizer custom-label`.
     - `gender`/`age_group`/`color`/`material`/`size`/`size_system`/`size_type`/`pattern`/`condition` invalid/low-quality → `optimizer:derivable` → `/feed-optimizer small-attributes` (the `attribute` column says which attribute; there are no per-attribute actions).
   - **Not fixable → advisory brief** (name the actor, no skill route):
     - `gtin` check-digit, `certification` code, malformed `id` → `external`.
     - `brand`, `mpn`, measures, dates, energy classes, destinations, dependency gaps → `source-required`.
3. **Finalise fixability and write it back.** Review the script's provisional classes per `fixability-classes.md` (derivable values that would be wrong without the source → `source-required`; advisory findings a CSV can actually supply → `optimizer:*`). Rewrite the affected rows in `attributes-queue.csv` — both `fixability_class` and `recommended_downstream` (canonical tokens only) — so the optimizer reads the finalised judgment, not the provisional stamp.
4. **Handoff.** Lead with the highest-severity CSV-fixable findings to `/feed-optimizer`; surface the advisory brief separately for the human/source actor. Severity sets the order within each lane.

## Notes

- This module pairs with Completeness: Completeness says "color missing on 200"; Attributes says "color = '#ff0000' on 150". Different fixes, both legitimate. Dependency integrity (e.g. `size` present but `size_system` missing) lives here, not in Completeness.
- Validity is vertical-independent — do not exclude an invalid present value because the attribute is "not relevant" to the vertical; that gate is Completeness's.
- The deterministic ruleset is the data-driven catalog (`scripts/lib/modules/attribute-validation-catalog.json`). Claude layers only the design judgments (is the `product_type`/GPC taxonomy actually well-designed) on top.
