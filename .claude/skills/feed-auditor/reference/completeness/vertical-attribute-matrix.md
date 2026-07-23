# Vertical → Attribute Matrix (SOP-distilled)

Distilled from the Product Feed Data Specification Reference. This is the **human-readable mirror** of the machine source of truth: the `completeness` blocks + `presence` config in `scripts/lib/modules/attribute-validation-catalog.json`. If you change a rule, change the **JSON** and keep this table in sync.

Account-agnostic: relevance is **derived per product from its vertical**, never hardcoded to one vertical for the whole account. A mixed catalog flags the right attributes per segment. Claude finalises with `business.md` + a one-line confirmation.

## How a product's vertical is detected

Signal chain (per product), implemented in `scripts/lib/taxonomy.js` + `completeness.js`:

1. **`google_product_category`** → resolved to a full path via the bundled Google taxonomy (`taxonomy-with-ids`), then the **top-level node** is the vertical. A numeric id (e.g. `974` → `Office Supplies > Shipping Supplies > Packing Materials` → **Office Supplies**) is decoded; a path uses its first node.
2. **`product_type` top-level node** → fallback when GPC is blank/unresolvable (merchant breadcrumb; may be foreign-language).
3. **Unclassified** → no positive signal. **Safety default: only the hard-required base fields are expected — never flagged for specialty attributes.**

The script reports `classification_source` (`gpc` / `gpc-uniform` / `product_type` / `unclassified`) and `classification_confidence` (`high` / `medium` / `low`). A **uniform GPC** (one distinct value across the catalog) is still used but lowers confidence — Claude then leans on `business.md` + user confirmation.

## Two-layer relevance model

A product's expected-attribute set = **Layer 1 (vertical base)** + **Layer 2 (cross-cutting conditions)**.

### Layer 1 — vertical base (from GPC top-level)

| Vertical (GPC top-level) | Adds (presence expected) |
|---|---|
| Apparel & Accessories | gender, age_group, color, size, size_type, material, pattern |
| Food, Beverages & Tobacco / Hardware / Office Supplies / Health & Beauty | unit_pricing_measure *(only when sold by a measurable quantity)* |
| Furniture / Home & Garden / Hardware / Sporting Goods / Baby & Toddler / Vehicles & Parts / Business & Industrial | product_length, product_width, product_height, product_weight *(Tier 2)* |
| (energy-regulated categories — see below) | energy_efficiency_class, certification |
| Everything else / unclassified | base only |

`product_type` and `google_product_category` are **always** expected (every vertical, Tier 1). `product_highlight`, `product_detail`, and `cost_of_goods_sold` are also **always** expected but **Tier 2** (upside) — present on richer listings / margin reporting, never an eligibility blocker.

### Layer 2 — cross-cutting conditions (vertical-independent)

| Condition (detected from the feed) | Adds |
|---|---|
| Variant product (`color`/`size`/`pattern`/`item_group_id` present) | item_group_id |
| Catalog contains used/refurbished products | condition |
| Branded catalog (`brand` share ≥ 30%) | brand, gtin (mpn when no gtin) |
| Account runs a Demand Gen, YouTube/Video, or Performance Max campaign (from `context/google-ads/data/campaigns.csv`) | short_title, lifestyle_image_link *(Tier 2)* |
| Energy-regulated category **and** EU target market | energy_efficiency_class, certification |

## Tiering (score impact)

- **Tier 1 — drives the score** (a relevant gap is a *fail*): hard-required base fields (id, title, description, link, image_link, price, availability), `product_type`, `google_product_category`, `condition`, `item_group_id` (variants), apparel `gender`/`age_group`/`color`/`size` **in required markets**, and `energy_efficiency_class`/`certification` for energy-regulated EU products.
- **Tier 2 — reported as upside only** (nice-to-have, no score weight): `material`, `size_type`, `pattern`, `unit_pricing_measure`, `brand`/`gtin` (when not an eligibility blocker), `product_length`/`product_width`/`product_height`/`product_weight` (dimensioned verticals), `product_highlight`, `product_detail`, `cost_of_goods_sold`, and `short_title`/`lifestyle_image_link` (Demand Gen / YouTube surfaces).

**Market gating:** apparel `gender`/`age_group`/`color`/`size` are Tier 1 only when the product is apparel **and** the target market is a required-size market (BR/FR/DE/JP/UK/US per the Data Spec). Outside those markets they drop to Tier 2.

## Energy-regulated categories (EU)

Detected by matching the resolved GPC **path** against the keyword list in `presence.energy_regulated_path_keywords` (lighting, refrigerators/freezers, washers/dryers, dishwashers, ovens/ranges, air conditioners, water heaters, televisions/displays, wine refrigerators, tyres, ventilation, space heaters). Gated by an EU target market. Tier 1 there (a legal eligibility fail), otherwise not applicable.

## Boundaries / dedup

- **Errors owns Merchant-flagged issues.** Completeness is the *proactive* presence check (catches gaps Merchant hasn't flagged yet); products Merchant already flagged are excluded here (error-lane-wins), so disapprovals are not double-counted.
- **Completeness = presence; Attributes = validity** of present values. Same catalog, two lenses.
- Never assume a vertical. A non-apparel catalog is never penalised for missing `gender`/`size`. A simple single-vertical store can legitimately be `strong`.
