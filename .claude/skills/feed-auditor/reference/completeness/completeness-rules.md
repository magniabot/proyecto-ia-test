# Completeness Rules

Source of truth for *what to check and how to tier it*: the `completeness` blocks + `presence` config in `scripts/lib/modules/attribute-validation-catalog.json`. 

The relevance **predicates** (vertical detection, market gating, variant/used/energy conditions) live in `completeness.js`. This file explains the model; `vertical-attribute-matrix.md` is the readable mirror of the catalog.

## What completeness owns

The **proactive presence check for every Data-Spec attribute** — including the hard-required base fields. Errors only mirrors what Merchant has already flagged; completeness catches the gaps Merchant hasn't flagged yet, with **error-lane-wins dedup** (products Merchant already flagged are excluded so disapprovals aren't double-counted).

Presence only. Whether a present value is *valid* is the Attributes module (same catalog, validity lens).

## Tiers (drive vs report)

- **Tier 1 — drives the score.** A relevant gap is a fail. Hard-required base fields (id, title, description, link, image_link, price, availability), `product_type`, `google_product_category`, `condition` (used/refurb catalog), `item_group_id` (variants), apparel `gender`/`age_group`/`color`/`size` **in required markets**, `energy_efficiency_class`/`certification` (energy-regulated + EU).
- **Tier 2 — reported as upside only** (nice-to-have, no score weight). `material`, `size_type`, `pattern`, `unit_pricing_measure`, `brand`/`gtin`, `product_length`/`product_width`/`product_height`/`product_weight` (dimensioned verticals), `product_highlight`, `product_detail`, `short_title` + `lifestyle_image_link` (Demand Gen / YouTube surfaces), `cost_of_goods_sold`.

Only Tier-1 misses add to the affected set behind the 0-100 score. Tier-2 misses appear in the queue + coverage and are folded into the narrative as optimizer opportunities.

## Relevance keys (catalog `completeness.relevance`)

| Key | Expected when | Tier |
|---|---|---|
| `always` | every product (product_type, google_product_category) | 1 |
| `always` | every product (product_highlight, product_detail, cost_of_goods_sold) | 2 |
| `apparel` | product classifies as apparel | gender/age 1*, material/size_type/pattern 2 |
| `apparel_or_variant` | apparel **or** a variant product (color, size) | 1* |
| `variant_signal` | product carries variant attributes but no item_group_id | 1 |
| `used_catalog` | catalog contains any used/refurbished products | 1 |
| `branded` | branded share ≥ 30% (brand, gtin) | 2 |
| `branded_no_gtin` | branded catalog **and** product has no gtin (mpn) | 2 |
| `unit_pricing_category` | unit-pricing vertical **and** sold by a measurable quantity | 2 |
| `dimensioned_category` | product's vertical is in `gpc_top_level_groups.dimensioned` (Furniture, Home & Garden, Hardware, Sporting Goods, Baby & Toddler, Vehicles & Parts, Business & Industrial) → product_length/width/height/weight | 2 |
| `demand_gen_surface` | account runs a Demand Gen, YouTube/Video, or Performance Max campaign (from `context/google-ads/data/campaigns.csv`) → short_title, lifestyle_image_link | 2 |
| `energy_eu` | energy-regulated category **and** EU target market | 1 |

\* **market-gated**: Tier 1 only when the product is apparel **and** the target market is a required-size market (BR/FR/DE/JP/UK/US); otherwise demoted to Tier 2.

## Provisional fixability

- `color`/`material`/`gender`/`age_group`/`pattern` missing → `optimizer:derivable` if a matching token is in title/description, else `source-required`.
- `size` missing → `optimizer:derivable` if a size token is in the title, else `source-required`.
- `condition` missing → `optimizer:derivable` (defaults to new; optimizer can stamp).
- `product_type` missing → `optimizer:derivable` if `google_product_category` is present (map from it), else `optimizer:strategy`.
- `google_product_category` missing → `optimizer:strategy` (taxonomy).
- hard-required `title`/`description` missing → `content-maker`; `image_link`→external (designer); `link`/`price`/`availability`→external (site/source).
- `gtin`/`brand`/`mpn`/`item_group_id`/`unit_pricing_measure`/`energy_efficiency_class` missing → `source-required` (cannot be invented); `certification` → `external` (authority).
- `product_length`/`product_width`/`product_height`/`product_weight` missing → `source-required` (dimensions live in the source system, not derivable from text); `cost_of_goods_sold` → `source-required` (margin data from the ecom platform).
- `product_highlight`/`product_detail`/`short_title` missing → `content-maker` (free-text enrichment, generated); `lifestyle_image_link` → `external` (designer / source imagery).

## Confidence

- High for Tier-1 gaps once relevance is confirmed; medium for Tier-2.
- Classification confidence (`high`/`medium`/`low`) is reported in `business_profile` — when uniform GPC or heavy unclassified share lowers it, confirm the vertical with the user before trusting the expected set.
- If the user says an attribute is irrelevant, drop it from the score entirely.
