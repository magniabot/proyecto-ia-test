# Attribute Analyser Rules

This file documents the rule *types* and the judgment Claude layers on top. See `attribute-validation-catalog.md` for the per-attribute table.

## Scope

Assess the **quality of every present attribute the Data Spec defines** that this module owns. Owned = format / enum / structure / identifier validity of all attributes **except** the ones other modules own:

- `title`, `description` free-text quality → **title-desc**
- `image_link`, `additional_image_link`, `lifestyle_image_link` → **images**
- `price` / `sale_price` / `availability` value-vs-site matching → **errors**
- raw attribute presence (is it blank?) → **completeness**

Present-only: never flag a blank attribute here — with **one** exception below (dependency integrity).

## Rule types (catalog-driven, deterministic — the script decides)

- **enum / enum_multi** — value must be in the Data-Spec value set (`gender`, `age_group`, `condition`, `size_system`, `size_type`, `energy_efficiency_class`, destinations, `pause`). `enum_multi` also enforces a max-value count.
- **boolean** — `true`/`false` only (`identifier_exists`, `adult`, `is_bundle`).
- **gs1** — `gtin` must be 8/12/13/14 digits with a valid GS1 check digit. If GTIN is marked by Google as invalid check if the product is a in-house brand or not. If yes then in that case the GTIN is just invented and not an official GTIN. In that case the identifier_exists should be used set to false to prevent the errors.
- **char_max / segment_char_max / max_segments** — Data-Spec character limits and the `/`-separated max-3 rule for `color`/`material`.
- **forbidden_regex** — `color` must not be a hex code; combined with the low-quality set this also rejects `multicolor`/`see image`.
- **low_quality** — generic/uninformative values (`n/a`, `various`, `multicolor`, NL equivalents, …) for `color`/`material`/`size`/`pattern`/`brand`/`custom_label_*`.
- **measure_format / measure_base / currency_format / iso_datetime / certification_format** — structured-value formats for `unit_pricing_*`, `shipping_weight`/dimensions, `cost_of_goods_sold`, `availability_date`/`expiration_date`, `certification`.
- **path_or_id** — `google_product_category` must be a numeric ID or a full `>`-path.
- **min_depth** — `product_type` deeper than a single level (depth ≥ 2); default useful depth ~3, do not force depth beyond segmentation value.
- **id_format** — `id`/`item_group_id`: no whitespace, within the character limit.

## Dependency integrity (the only "missing attribute" this module owns)

A present attribute that demands a companion which is absent (coded in `attributes.js`, not the catalog):

- `size` present → `size_system` required (`optimizer:derivable`)
- `availability` = preorder/backorder → `availability_date` required (`source-required`)
- `unit_pricing_measure` present → `unit_pricing_base_measure` required (`source-required`)
- `energy_efficiency_class` present → `min`/`max_energy_efficiency_class` required (`source-required`)

Completeness keeps **standalone relevance** (account profile says an attribute should exist); attributes keeps **companion integrity**. No overlap.

## Fixability — two lanes

- **CSV-fixable → `/feed-optimizer`:** `optimizer:strategy` (taxonomy/structure design: `product_type` → `product-type`, `google_product_category` → `taxonomy`, `custom_label_*` → `custom-label`) and `optimizer:derivable` (value normalisation computable from feed data: `gender`, `age_group`, `color`, `material`, `size`, `size_system`, `size_type`, `pattern`, `condition` — all served by the single `small-attributes` action).
- **Not CSV-fixable → advisory brief:** `source-required` (value exists nowhere in the feed — `brand`, `mpn`, measures, dates, energy classes, destinations) and `external` (authoritative external correction — invalid `gtin`/check digit, `certification` code, malformed `id`). The brief names the actor; it is **not** a skill route.

## Severity & scoring

- Every finding carries a **severity tier** (`critical`/`important`/`recommended`/`optional`) from the Optimization Guidelines priority framework. Severity drives **report and handoff ORDER**, not the score number.
- Score stays binary `1 − affected/eligible` (a product is "affected" if it has ≥1 finding), comparable to the other feed modules. **Non-CSV-fixable findings still count toward the score** — the score measures feed quality; the lane measures who fixes it.

## Boundaries

- Validity is **vertical-independent**: a hex `color` or bad-checksum `gtin` is wrong in any account — do **not** gate validity by the relevance matrix (that is Completeness's concern).
- Do not flag a missing attribute except the dependency-integrity cases above.
- Do not invent a "correct" value you cannot justify from the data; if cleanup needs a human call, route it to the advisory lane and lower confidence. Never fabricate identifiers, certifications, or measures.
