# Content — Rules

The authoring contract for `/feed-optimizer content`. These rules are enforced in code
(`scripts/lib/llm/openai-client-content.js` for the prompt, `scripts/lib/llm/validate-content.js`
for the output gate) — this file is the human-readable source of truth behind them.

## 1. Owned fields & trigger

| Field | Mode | Trigger | Latitude |
|---|---|---|---|
| `title` | rewrite | existing value trips a weakness detector | **reassemble** — rebuild to the category formula from the full evidence pool (old title is a fact source, not a template); no new facts |
| `description` | rewrite | existing value trips a weakness detector | **compose-grounded** |
| `short_title` | backfill | missing **and** a Demand Gen / Video / PMax surface exists | compose-grounded |
| `product_highlight` | backfill | missing (always-relevant, Tier-4) | compose-grounded |
| `product_detail` | backfill | missing (always-relevant, Tier-4) | compose-grounded |

A rewrite fires **only** when the auditor's detectors (`titleIssues` / `descriptionIssues`, imported
from `feed-auditor-core.js`) flag the existing value. Good copy is never rewritten. `short_title`
scope is gated by `campaigns.csv` via the auditor's `demand_gen_surface` relevance.

## 2. Latitude — what may be invented

- **The evidence pool** the model may draw from is the old title, the description, the populated
  structured attributes, the GPC path, the target market, and the **product image**. The image is a
  first-class evidence source: the model may read **visible attributes** (color, pattern,
  material/finish) off it and use them as grounded facts. Image detail defaults to `auto` (the model
  picks resolution); override with `--image-detail low|high` (higher = better attribute reading, more
  cost — surfaced at the cost gate).
- **Factual claims are grounded only.** Brand, materials, dimensions, specs, capacity, compatibility,
  certifications, "waterproof", "organic", "BPA-free", awards, country of origin — the model may state
  these **only if present** in the evidence pool above. If a fact is not in the evidence, it must be
  omitted; the field returns `null` rather than guess. Abstentions are logged to `exceptions.csv` (the
  source-required/advisory lane).
- **Rhetorical framing is allowed** for `description` / `short_title` / `product_highlight` /
  `product_detail`: connective and benefit phrasing that restates grounded facts persuasively
  ("designed for everyday use", "all-day comfort"). No **new facts** — only framing of existing ones.
- **`title` has no rhetorical latitude** — it is reassembled from existing facts per the category
  formula. It is rebuilt (not lightly edited): the old title's core product-type noun is preserved for
  query match, and everything else is reordered, reworded, or dropped to front-load the highest-value
  matching attributes. The output must be a clear improvement on the old title (no script enforces
  "better" — it is a prompt instruction; the validator only guarantees the new value does not re-trip
  a weakness detector).

## 3. Category formulas (source of the recombination)

Imported from the auditor (`TITLE_FORMULAS` / `DESCRIPTION_TEMPLATES`). Each product is mapped to a
formula from its `gpc_path_en` top-level vertical; unmapped verticals use the **Universal**
(`general`) formula. The user confirms/overrides this mapping in Phase C-1.

The prompt also injects a **per-category best-practice block** matching the product's `catalog_type`
(`scripts/lib/llm/content-guidance.js`, distilled from `sops/Product Title Catalog.md` +
`sops/Product Description Catalog.md`): the attribute priority order, one before→after example, and
the category's description shape. Only the block for that product's category is sent — keeping each
per-product call category-expert without carrying all nine catalogs. These steer word choice,
attribute priority, and ordering; they are **not** a fact source.

Important check the brand in the feed, if brand is not that well known offer to remove brand from the front of the title and
add to the back of the title.

| Category | Title formula |
|---|---|
| Fashion / Apparel | Brand + Gender + Product type + Attributes (color/size/material) |
| Electronics | Brand + Attributes + Product type + Model |
| Consumables / Health & Beauty | Brand + Product type + Attributes (weight/amount/flavor) |
| Home / Furniture | Brand + Product type + Attributes (size/material/color) + Style |
| Books / Media | Title + Author + Format + ISBN |
| Seasonal / Occasion | Occasion + Product type + Attributes |
| Sports / Outdoors | Brand + Product type + Attributes (size/weight/material) + Use case |
| Automotive | Year/Make/Model compatibility + Product type + Brand + Attributes |
| **general (Universal)** | Brand + Product type + Key attribute + Differentiator |

## 4. Prohibited in ALL outputs (from Product Feed Optimization Guidelines)

Enforced by `prohibitedContentIssues` (shared with the auditor) on every authored field:
- No promotional / price / sale text.
- No ALL-CAPS for emphasis.
- No links / URLs.
- No HTML markup.
- No store/price boilerplate.
- Do not describe accessories or other products.

## 5. Validation = the same detectors that triggered the rewrite

Every authored value is re-checked on output. It is emitted **only** if it trips **zero** weakness
reasons and obeys the limits below; otherwise it is **demoted to `exceptions.csv`** and the original
is kept (retry-then-abstain — an invalid value is never written to the feed). This closes the loop:
`content` can only emit prose the auditor would not immediately re-flag.

- `title` → `titleIssues` must return empty.
- `description` → `descriptionIssues` must return empty.
- `short_title` / `product_highlight` items / `product_detail` values → `prohibitedContentIssues`
  must return empty.

## 6. Char / structure limits

Sourced from `CATALOG.content_limits` in `attribute-validation-catalog.json` (single source of truth —
never hardcoded in the action):

| Field | Limit |
|---|---|
| `title` | ≤ 150 chars, front-load within ~70 (use the full length for real matching terms — keep relevant synonyms + pack/unit quantities) |
| `description` | **500–1000 chars** (target range, enforced: under-500/over-1000 → exceptions), key facts within first 160 |
| `short_title` | ≤ 65 chars, **brand excluded** (most-important-info only) |
| `product_highlight` | 2–4 bullets, each ≤ 150 chars (fewer than 2 valid → abstain) |
| `product_detail` | rows of `section_name`/`attribute_name` ≤ 140, `attribute_value` ≤ 1000 |

## 7. Confidence floor

`--confidence-floor low|medium|high` demotes sub-floor authored values to `exceptions.csv` rather than
into the supplemental feed. Default `low` (include unless explicitly low-confidence).

## 8. Output & safety

- Supplemental feed per `feed_label`; `title`/`description` are **override** columns (overlay the
  primary feed by `id` on import — the primary feed is untouched and the user can stop importing to
  revert).
- `diff.csv` pairs every change old → new with the trigger reason + evidence — review before import.
- The **sample is the gate**; post-run is a summary + a **rewrite-weighted** spot-check. Nothing is
  auto-applied.
