# Feed Optimizer - Transformation Rules

Use this file after the fresh-audit gate passes. `feed-optimizer` writes reviewed CSV outputs only. It does not edit Merchant Center, Google Ads, Channable, ProductHero, ProfitMetrics, ecommerce platforms, or source feeds.

## Supported Actions

| Action | Target | Reliable input required | Notes |
|---|---|---|---|
| `product-type` | `product_type` | Existing product type hierarchy or user-approved mapping | Do not infer product type from title or Google category without review. |
| `taxonomy` | `google_product_category` | Existing product type or Google product category | Use the official Google taxonomy. Export numeric IDs. |
| `custom-label` | `custom_label_0` through `custom_label_4` | Business context, current label state, specialist-approved strategy | Holistic strategy for all 5 slots. Creates CSVs for static labels only. Points to tools (ProfitMetrics, Channable, ProductHero Labelizer) for dynamic labels. |
| `small-attributes` | Constrained attributes (`color`, `size`, `material`, `pattern`, `gender`, `age_group`, `size_type`, `size_system`, `condition`, dimensions) | Product image + title + description; fresh audit cache | LLM extraction, sample-gated with cost confirmation. Abstains when the value cannot be justified from feed data — never fabricates. |
| `content` | `title`, `description`, `short_title`, `product_highlight`, `product_detail` | Auditor detector flags (rewrites) / missing fields (backfill); existing feed facts | LLM authoring, sample-gated with cost confirmation. Rewrites only detector-flagged titles/descriptions; grounded in feed facts — never invents specs or claims. |

## Boundaries

- Static/business-rule labels are allowed when the source is reliable.
- Dynamic performance-label upload generation is excluded as a standard action.
- Source feed exports are excluded in v1.
- Price competitiveness, promo lift, sale badge analysis, and benchmark work belong outside this skill.
- Title and description generation belongs to the `content` action (`/feed-optimizer content`), never to the deterministic actions.

## Custom Label Defaults

When proposing slot allocation during `custom-label` strategy, use these as starting conventions (specialist can override):

| Slot | Default tactic | Rationale |
|---|---|---|
| `custom_label_0` | Performance tier | Primary segmentation axis — most impactful for campaign structure |
| `custom_label_1` | Margin tier | Secondary business dimension |
| `custom_label_2` | Promo flag | Promotional visibility |
| `custom_label_3` | Inventory / Bestseller | Operational signal |
| `custom_label_4` | Seasonality / Lifecycle | Time-based dimension |

These are conventions, not rules. The strategy interview determines actual allocation based on what the business needs.

## Static Labels

Use custom labels for business rules only when the label will remain useful after import. Do not create labels that will become stale quickly unless the README warns that the user should automate the rule in their feed tooling.
