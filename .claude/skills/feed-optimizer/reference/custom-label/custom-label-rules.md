# Feed Optimizer - Custom Label Rules

Runtime reference for the `custom-label` action. Read this file in Phase 1 when the action is `custom-label`.

## What Custom Labels Are

Custom labels (`custom_label_0` through `custom_label_4`) are **merchant-defined segmentation attributes** used to organize products into campaign listing groups and budget buckets. They have no fixed meaning — the merchant defines the strategy.

Custom labels are NOT product type (merchant's catalog taxonomy) or Google product category (Google's taxonomy for ad serving). They are campaign management tools.

## Slot Constraints

- 5 slots total: `custom_label_0` through `custom_label_4`
- Each slot accepts free text (max 100 characters, but keep them short)
- Each slot should serve exactly one tactic — do not overload a slot with unrelated values
- Slots are scarce — plan holistically before filling any individual slot

## Static vs Dynamic Labels

### Static Labels (this skill creates these)

Labels derived from business rules, product attributes, or specialist judgment that change infrequently.

| Tactic | Example values | Typical update frequency |
|--------|---------------|------------------------|
| Category-based | `running_shoes`, `accessories`, `clearance` | Rarely (structural) |
| Seasonality | `summer`, `winter`, `holiday`, `evergreen` | Seasonal |
| Lifecycle | `new`, `core`, `mature`, `end_of_life` | Monthly |
| Promo flag | `on_sale`, `regular_price` | As promotions change |
| Margin tier | `high_margin`, `standard_margin`, `low_margin` | When costs change |
| Bestseller | `bestseller`, `regular` | Monthly |

### Dynamic Labels (this skill does NOT create these)

Labels that require continuous recalculation from live performance or inventory data. Point the user to the appropriate tool instead of creating a CSV.

| Tactic | Tool recommendation | Why |
|--------|-------------------|-----|
| Performance tiers (hero/sidekick/villain/zombie) with POAS focus | **ProfitMetrics** | Integrates profit data for POAS-based classification |
| Performance tiers without POAS focus | **Channable** or **ProductHero Labelizer** | Automated labeling from Google Ads performance data |
| Real-time inventory levels | Feed management tool (Channable, DataFeedWatch) | Stock changes too fast for static CSV |
| Price competitiveness | Feed management tool + price monitoring | Market prices change daily |
| Composite scoring (Tier 3) | Feed management tool + data pipelines | Requires continuous multi-variable calculation |

Never create a CSV for a dynamic label. A static snapshot of dynamic data goes stale immediately and creates worse outcomes than no label at all.
Also important to know, Profitmetrics and all other Labelizers use volume as a factor, so when these are used putting bestsellers in a separate label is not recommended, unless data says otherwise.

## Tool Signature Detection

When auditing current label state, recognize these known tool patterns:

| Pattern | Likely tool | Confidence |
|---------|------------|------------|
| `hero`, `sidekick`, `villain`, `zombie` | ProductHero Labelizer | High |
| `highlyprofitable`, `profitable`, `unprofitable`, `low traffic` | ProfitMetrics | High |
| `over_index`, `index`, `under_index` | Flowboost Labelizer | High |
| `profitable`, `highly_profitable`, `unprofitable`  | ProfitMetrics (status) | High |
| Single value on 95%+ of products | Tool status or broken label | Medium |
| Numeric scores (0-100, 1-10) | Composite scoring tool | Medium |

Always confirm tool detection with the specialist — patterns are hints, not proof.

## Segmentation Tiers

From the Feed Segmentation Mental Model, three tiers of label sophistication:

| Tier | Approach | Infrastructure needed | This skill handles |
|------|----------|----------------------|-------------------|
| **Tier 1** | Category + building blocks (sale, season, lifecycle, inventory, bestseller) | Feed rules only | Yes — static labels |
| **Tier 2** | Performance-based (hero/sidekick/villain/zombie) | Labeling tool required | No — recommend tool |
| **Tier 3** | Composite scoring | Feed management tool + data pipelines | No — recommend tool |

The strategy interview should determine which tier fits the account and which tactics within that tier are actionable.

## Data Sources for Static Labels

| Tactic | Data in feed? | Source if not | Agent approach |
|--------|--------------|---------------|----------------|
| Category-based | Yes — `product_type` | N/A | Derive from product type hierarchy |
| Seasonality | Rarely | Domain knowledge + product data | Infer from product types/titles, specialist reviews |
| Lifecycle | Sometimes — `date_added` or similar | User provides | Ask user for product age data or launch dates |
| Promo flag | Yes — `sale_price` field | N/A | Check if `sale_price` < `price` |
| Margin tier | Almost never | User provides CSV | Ask user for `product_id,margin_tier` mapping |
| Bestseller | No | Google Ads performance data | Use shopping performance CSV from feed-auditor cache |

When data is not available and cannot be inferred, tell the specialist what is needed and in what format. Do not guess.

## Slot Conflict Resolution

Some tactics compete for the same slot (per transformation-rules.md defaults):

| Conflict | Default slot | Resolution |
|----------|-------------|------------|
| Seasonality + Lifecycle | Both default to `custom_label_4` | Specialist picks one, or uses composite values (`summer_new`, `winter_core`) |
| Multiple Tier 1 building blocks | Spread across 5 slots | If more than 5 tactics are needed, prioritize by business impact |

When a conflict arises:
1. Surface it explicitly with the trade-off
2. Recommend based on business context (which tactic has more campaign management value for this account)
3. Let the specialist decide

## Strategy Persistence

The custom label strategy is logged in three places:

1. **`created/feed-optimizer/jobs/{job_id}/custom-label-strategy.md`** — full strategy doc with slot allocation, rationale, and implementation notes (copied into `output/` on finalize)
2. **`context/business.md`** — new `## Custom Label Architecture` section with the slot allocation table
3. **`context/memory/{date}.md`** — log entry for the strategy decision

This ensures future skill runs (feed-auditor, bidding-auditor, budget-auditor) can understand the label architecture.

## Specialist Interaction Model

This action is more consultative than product-type or taxonomy. The agent acts as a strategic advisor:

1. **Propose first, adjust together.** Do not ask open-ended questions. Present a recommended strategy based on business context and let the specialist react.
2. **Be specific about data needs.** When data is missing, specify exactly what is needed and in what format.
3. **Surface trade-offs, let specialist decide.** When there are genuine choices (slot conflicts, tier selection, tactic priority), present the options with a recommendation and rationale.
4. **Don't ask when the answer is obvious.** If business.md says they use ProfitMetrics and custom_label_2 has ProfitMetrics values, don't ask "do you use ProfitMetrics?" — confirm and move on.

## Output Contract

### Strategy phase
- `custom-label-strategy.md` — full strategy document

### Per-slot implementation (static labels only)
- `mapping-table-cl{N}.csv` — full mapping with product_id, old value, new value, changed flag
- `exceptions.csv` — products that could not be assigned

### Final phase
- `import.csv` — columns: `id` + only the custom label columns that were changed (e.g., `id,custom_label_1,custom_label_4`). Lean format for supplemental feed import.
- `diff.csv` — all changed rows with old and new values per label
- `exceptions.csv` — products that could not be assigned
- `README.md` — job summary with strategy overview and file manifest

## Boundaries

- This action writes custom label values only
- It does not set `product_type` or `google_product_category` — those are separate actions
- It does not modify Merchant Center, Google Ads, feed tools, or any upstream system
- It never creates CSVs for dynamic/performance-based labels
- It does not configure feed tool rules (Channable, DataFeedWatch, etc.) — it documents the rules for the specialist to implement
