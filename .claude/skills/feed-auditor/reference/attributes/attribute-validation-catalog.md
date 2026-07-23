# Attribute Validation Catalog (spec)

Human/agent-readable mirror of `scripts/lib/modules/attribute-validation-catalog.json` — the **single source of truth** for TWO lenses over the same attribute set:

1. **Validity (this doc / the attributes module):** the deterministic, present-only `checks` below. The script iterates each present owned attribute against the catalog; Claude layers the design judgments (`product_type`/GPC taxonomy quality).
2. **Presence/relevance (the completeness module):** the `presence` config block + the optional `completeness` block on each attribute (`relevance` key + `tier`). See `reference/completeness/vertical-attribute-matrix.md` for that lens.

Distilled from the Product Feed Data Specification Reference and Product Feed Optimization Guidelines.

If you change a rule, change the **JSON** and keep both mirror docs in sync — do not edit `attributes.js`/`completeness.js` for per-value or per-relevance rules.

## Owned attributes

| Attribute | Tier | Checks | Lane → route |
|---|---|---|---|
| `id` | critical | no whitespace, ≤50 | external → advisory |
| `gtin` | critical | 8/12/13/14 digits + GS1 check digit | external → advisory |
| `mpn` | important | ≤70 | source-required → advisory |
| `identifier_exists` | important | `true`/`false` | source-required → advisory |
| `brand` | important | ≤70, not low-quality | source-required → advisory |
| `google_product_category` | important | numeric ID or full `>`-path | optimizer:strategy → taxonomy |
| `product_type` | important | depth ≥ 2, ≤750 | optimizer:strategy → product-type |
| `custom_label_0–4` | recommended | ≤100, not low-quality | optimizer:strategy → custom-label |
| `gender` | recommended | enum male/female/unisex | optimizer:derivable → gender |
| `age_group` | recommended | enum newborn/infant/toddler/kids/adult | optimizer:derivable → age-group |
| `color` | recommended | no hex, ≤3 via `/`, ≤40/value & ≤100 total, not low-quality | optimizer:derivable → color |
| `size` | recommended | ≤100, not low-quality | optimizer:derivable → size |
| `size_system` | recommended | enum (AU/BR/CN/DE/EU/FR/IT/JP/MEX/UK/US) | optimizer:derivable → size-system |
| `size_type` | recommended | enum (regular/petite/plus/tall/big/maternity), ≤2 | optimizer:derivable → size-type |
| `material` | recommended | ≤200, ≤3 via `/`, not low-quality | optimizer:derivable → material |
| `pattern` | recommended | ≤100, not low-quality | optimizer:derivable → pattern |
| `item_group_id` | recommended | no whitespace, ≤50 | source-required → advisory |
| `condition` | important | enum new/refurbished/used | optimizer:derivable → condition |
| `adult` | recommended | `true`/`false` | source-required → advisory |
| `multipack` | recommended | whole number | source-required → advisory |
| `is_bundle` | recommended | `true`/`false` | source-required → advisory |
| `unit_pricing_measure` | recommended | number + allowed unit | source-required → advisory |
| `unit_pricing_base_measure` | recommended | base in {1,2,4,8,10,100} | source-required → advisory |
| `cost_of_goods_sold` | recommended | `<amount> <ISO currency>` | source-required → advisory |
| `availability_date` | important | ISO 8601 | source-required → advisory |
| `expiration_date` | optional | ISO 8601 | source-required → advisory |
| `shipping_weight` | recommended | number + lb/oz/g/kg | source-required → advisory |
| `shipping_length/width/height` | recommended | number + cm/in | source-required → advisory |
| `energy_efficiency_class` (+ min/max) | important | enum A+++…G | source-required → advisory |
| `certification` | important | `authority:name:code` | external → advisory |
| `excluded_destination` / `included_destination` | optional | enum set | source-required → advisory |
| `pause` | optional | enum ads/all | source-required → advisory |

## Cross-attribute dependency integrity (coded in `attributes.js`)

| Trigger | Required companion | Lane → route |
|---|---|---|
| `size` present | `size_system` | optimizer:derivable → size-system |
| `availability` = preorder/backorder | `availability_date` | source-required → advisory |
| `unit_pricing_measure` present | `unit_pricing_base_measure` | source-required → advisory |
| `energy_efficiency_class` present | `min`/`max_energy_efficiency_class` | source-required → advisory |

## Explicitly NOT owned (other modules)

`title`, `description`, `short_title`, `product_highlight`, `product_detail` (free-text → title-desc); `image_link`/`additional_image_link`/`lifestyle_image_link` (images); `price`/`sale_price`/`availability` value-vs-site matching (errors); raw presence (completeness); `link`, `shipping_label`, `tax_category` (no deterministic validity rule worth a finding).
