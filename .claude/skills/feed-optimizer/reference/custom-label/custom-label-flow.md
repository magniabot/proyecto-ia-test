## Custom Label Flow (Phases CL-0 through CL-4)

When the action is `custom-label`, follow these phases. Read `reference/custom-label/custom-label-rules.md` for full rules.

### Phase CL-0a: Gate (mandatory — never skip)

```bash
node .claude/skills/feed-optimizer/scripts/plan.js gate
```

Fails fast on missing or stale (>24h) feed-auditor evidence — route to `/feed-auditor` and do not
proceed. The CL-3/CL-4 script phases (`apply-labels`, `finalize`) re-check freshness internally,
but CL-0 through CL-2 are Claude-driven, so never skip this gate.

### Phase CL-0: Current State Audit

1. Read `context/feed/cache/merchant-products-normalized.json`.

2. For each `custom_label_0` through `custom_label_4`, compute:
   - Fill rate: count of non-empty values / total products
   - Unique values: list of distinct values with product counts
   - Top 5 values by frequency

3. Classify each slot:

   | Classification | Criteria |
   |---------------|----------|
   | **Tool-managed** | Values match a known tool signature (see rules) |
   | **Static/meaningful** | Few distinct values mapping to a business concept |
   | **Broken/stale** | Single value on 95%+ products, or values with no business meaning |
   | **Empty** | 0% fill rate |

4. Read `context/business.md` for:
   - Vertical (ecommerce, lead gen, SaaS)
   - B2B / B2C
   - Goals and KPIs (ROAS target? POAS target? growth vs efficiency?)
   - Available tools (ProfitMetrics, Channable, ProductHero, etc.)
   - Campaign structure (Shopping, PMax, how many campaigns)
   - Any existing custom label notes

5. Read `context/feed/cache/google-ads-shopping-performance.csv` for performance data availability (needed to assess whether bestseller labeling is feasible).

### Phase CL-1: Discovery & Validation

Present the audit findings as a table:

```
| Slot | Fill Rate | Classification | Top Values | Detected Tool |
|------|-----------|---------------|------------|---------------|
| CL0  | 0%        | Empty          | —          | —             |
| CL1  | 0%        | Empty          | —          | —             |
| CL2  | 99.9%     | Tool-managed   | highlyprofitable (800), profitable (600), unprofitable (400), Low traffic (363) | ProfitMetrics |
| CL3  | 100%      | Broken/stale   | Recording clicks (2164) | ProfitMetrics (status) |
| CL4  | 0%        | Empty          | —          | —             |
```

For each non-empty slot:

- **Tool-managed (high confidence):** State the detection and ask for confirmation.
  > "custom_label_2 has ProfitMetrics performance values. Is this actively managed by ProfitMetrics? Should it stay as-is?"

- **Tool-managed (medium confidence):** State the detection with less certainty.
  > "custom_label_3 shows 'Recording clicks' on all products — this looks like a ProfitMetrics status label. Is this intentional, or is it a leftover from setup?"

- **Static/meaningful:** Ask what the label represents and whether it should be kept.
  > "custom_label_4 has values 'summer', 'winter', 'evergreen' — is this an active seasonality label you want to keep?"

- **Broken/stale:** Flag the issue and recommend action.
  > "custom_label_3 has the same value on every product — it provides no segmentation value. I'd recommend clearing this slot and repurposing it."

Once all slots are confirmed, determine:
- Which slots are **LOCKED** (tool-managed, do not touch)
- Which slots are **AVAILABLE** (empty or broken, can be assigned)
- Which slots are **KEEP** (existing static label the specialist wants to retain)

Log the confirmed state:
- Write a `## Custom Label Architecture` section to `context/business.md`
- Add an entry to `context/memory/{date}.md`

### Phase CL-2: Strategy Interview

Based on confirmed slot state and business context, build a recommended strategy.

**Step 1: Pre-filter tactics**

Using business.md context, determine which tactics are relevant:

| Signal from business.md | Tactics to consider | Tactics to skip |
|------------------------|--------------------|-----------------| 
| Has ProfitMetrics / POAS tracking | Performance labels already handled | Don't recommend performance labeling tool |
| Ecommerce with seasonal products | Seasonality | Skip if catalog is evergreen |
| Clear margin tiers or margin data available | Margin tier | Skip if no margin data and user can't provide it |
| Frequent new product launches | Lifecycle | Skip if static catalog |
| Runs promotions / has sale_price data | Promo flag | Skip if always-on pricing |
| Large catalog with performance variance | Bestseller | Skip if small catalog or no performance data |
| Category-specific ROAS/POAS needs | Category-based | Skip if single-category store |
| Multiple data sources + enterprise | Composite scoring (Tier 3) | Point to feed tool, don't create |

**Step 2: Propose slot allocation**

Present a recommended allocation table:

```
| Slot            | Tactic          | Type    | Source                  | Action                              |
|-----------------|-----------------|---------|-------------------------|-------------------------------------|
| custom_label_0  | Performance tier | DYNAMIC | ProfitMetrics           | Already managed — do not touch      |
| custom_label_1  | Margin tier      | STATIC  | User-provided CSV       | Feed-optimizer creates import CSV   |
| custom_label_2  | (reserved)       | —       | —                       | Keep available for future use       |
| custom_label_3  | Seasonality      | STATIC  | Product type + titles   | Feed-optimizer creates import CSV   |
| custom_label_4  | Lifecycle        | STATIC  | Product age data        | Feed-optimizer creates import CSV   |
```

Include rationale for each recommendation:
- Why this tactic matters for this business
- Why this slot (default convention or practical reason)
- Why STATIC vs DYNAMIC

**Step 3: Surface conflicts**

If two tactics compete for the same slot:

> "Both seasonality and lifecycle default to custom_label_4. Options:
> 1. **Seasonality on CL4** — better fit if your catalog has strong seasonal demand patterns (e.g., summer packaging vs. year-round)
> 2. **Lifecycle on CL4** — better fit if you frequently launch and discontinue products
> 3. **Composite values on CL4** — combine both (e.g., `summer_new`, `evergreen_core`) but more complex to manage in listing groups
>
> Given your catalog is mostly evergreen packaging materials with mild Q4 seasonality, I'd recommend lifecycle over seasonality. What do you prefer?"

**Step 4: Identify data requirements**

For each STATIC slot in the approved strategy, determine data availability:

| Tactic | Data check | If available | If not available |
|--------|-----------|-------------|-----------------|
| Category-based | Check `product_type` fill rate | Use product type hierarchy to derive labels | Run `/feed-optimizer product-type` first |
| Seasonality | Check product types/titles for seasonal signals | Propose assignments, specialist reviews | Ask specialist to classify product categories as seasonal/evergreen |
| Lifecycle | Check for `date_added` or similar field | Use dates to compute age buckets | Ask user: "I need a CSV with `product_id,launch_date` or `product_id,lifecycle_stage`" |
| Promo flag | Check `sale_price` vs `price` | Auto-derive `on_sale` / `regular_price` | Ask if promotions are managed elsewhere |
| Margin tier | Check for cost/margin fields | Use available data | Ask user: "I need a CSV with `product_id,margin_tier` (high/standard/low) or `product_id,cost`" |
| Bestseller | Check shopping performance CSV | Rank by conversions/revenue, propose top N | Need more performance history |

Be specific about what is needed and in what format. Do not proceed with a static label if the data source is unreliable.

**Step 5: Get approval**

Present the final strategy for specialist sign-off:

> "Here is the proposed custom label strategy. Approve before I start creating label assignments?"

Once approved, write the strategy to:

```
created/feed-optimizer/jobs/{job_id}/custom-label-strategy.md
```

Format:

```markdown
# Custom Label Strategy — {Client Name}

Created: {date}
Job ID: {job_id}

## Slot Allocation

| Slot | Tactic | Type | Source | Update Frequency |
|------|--------|------|--------|-----------------|
| ... | ... | ... | ... | ... |

## Rationale
{Why these tactics were chosen for this business}

## Dynamic Label Notes
{For each DYNAMIC slot: which tool manages it, what the rules are if known}

## Static Label Definitions
{For each STATIC slot: what the values mean, how products are assigned}

## Data Dependencies
{What external data was needed and where it came from}
```

### Phase CL-3: Static Label Implementation

For each STATIC slot that needs a CSV (process sequentially, one slot at a time). Decide the **rule** at category/tactic level, then expand it to per-product rows **mechanically** — never write per-product rows by hand; that does not scale past small catalogs.

**Step 1: Data gathering**

- Read relevant feed data (product types, titles, prices, sale prices, dates)
- Read any user-provided files (margin CSV, lifecycle CSV)
- Read shopping performance data if needed (for bestseller labeling)

**Step 2: Author the label spec**

Write a per-slot spec file (the Claude-authored artifact — a small rule, not per-product rows):

```text
created/feed-optimizer/jobs/{job_id}/label-spec-cl{N}.json
```

```json
{
  "slot": "custom_label_3",
  "tactic": "seasonality",
  "rule": {
    "type": "keyed-mapping",
    "key_field": "product_type",
    "match": "prefix",
    "map": { "Geschenkverpakkingen": "seasonal", "Kerstartikelen": "seasonal" },
    "default": "evergreen"
  },
  "overrides": { "157694603": "seasonal" }
}
```

Rule types, one per tactic family:

| Rule type | Used for | Shape |
|-----------|----------|-------|
| `keyed-mapping` | Category-based, seasonality, margin-by-category | `key_field` (any product field), `match`: `"exact"` or `"prefix"` (segment-aware on `" > "` paths — `"Boxes"` matches `"Boxes > Shipping"`, never `"Boxers"`), `map` {field value → label}, `default` (omit/null → unmatched products become exceptions) |
| `ranked` | Bestseller | `metric` (`conversions`, `conversions_value`, `clicks`, `cost`), `top_n`, `top_value`, `rest_value` — ranks via the shopping performance CSV |
| `user-csv` | Margin tier, lifecycle from user data | `path` (project-relative CSV), `id_column` (default `product_id`), `value_column` (default `value`), `default` |
| `derived-promo` | Promo flag | `on_sale_value` / `regular_value` (defaults `on_sale`/`regular_price`); needs `sale_price` + `price` in the cache — products missing either become exceptions |

`overrides` ({product_id → value}) wins over the rule for individual products. Claude's judgment lives in the spec — e.g. for seasonality, classify the product-type branches as seasonal/evergreen using domain knowledge and encode that as the `map`.

**Step 3: Apply mechanically**

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=custom-label \
  --phase=apply-labels \
  --slot={N} \
  --job-id={job_id}
```

The script validates the spec (slot name, value length ≤100 chars, ≤1000 distinct values — it warns past ~20) and writes:

```text
created/feed-optimizer/jobs/{job_id}/mapping-table-cl{N}.csv
created/feed-optimizer/jobs/{job_id}/exceptions-cl{N}.csv
```

Mapping table columns: `product_id,title,feed_label,target_country,slot,old_value,new_value,changed`

Review the printed summary, value distribution, and 20-row diff sample, then present to the specialist:
- Total products
- Products assigned per value (distribution)
- Products changed vs unchanged
- Exceptions (products that could not be assigned)

**Step 4: Approval gate**

Stop and wait for specialist approval of the mapping table. The specialist may:
- Approve as-is
- Request changes to specific assignments
- Request value name changes
- Request a different distribution (e.g., "too many products in 'bestseller', tighten the threshold")

If corrections are needed, update the **label spec** (not the mapping table), re-run `apply-labels`, and re-present.

Only proceed to the next slot after approval.

### Phase CL-4: Final Outputs

Only after all mapping tables are approved, run finalize:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=custom-label \
  --phase=finalize \
  --job-id={job_id}
```

It merges all approved per-slot mapping tables and mechanically writes:

**Import CSV** — `id` + the custom label columns this job configured, containing every product with at least one changed label:

```
created/feed-optimizer/jobs/{job_id}/output/import.csv
```

Example for a job that created labels on CL1 and CL4:
```csv
id,custom_label_1,custom_label_4
SKU001,high_margin,core
SKU002,low_margin,new
SKU003,standard_margin,core
```

If the job spans multiple markets (feed_label + target_country), it writes one import file per market instead:

```
created/feed-optimizer/jobs/{job_id}/output/import-{feed_label}-{country}.csv
```

**Supporting files:**

```
created/feed-optimizer/jobs/{job_id}/output/custom-label-strategy.md    (copied from jobs/ planning dir when present)
created/feed-optimizer/jobs/{job_id}/output/diff.csv                     (all changed rows with old + new per label)
created/feed-optimizer/jobs/{job_id}/output/exceptions.csv               (products that could not be assigned to any label)
created/feed-optimizer/jobs/{job_id}/output/README.md                    (job summary — extend with strategy notes if useful)
```

After writing, build `created/feed-optimizer/jobs/{job_id}/output/diff.html` from `diff.csv` per
`reference/shared/review-html.md` (branded, self-contained, read-only — a before/after table of
old→new label values per slot) and `open` it so the specialist reviews the change set in the browser.
The CSV stays the import source of truth; if building the HTML fails, point them at the CSV.

**Persistence updates:**

1. Update `context/business.md` — add or update the `## Custom Label Architecture` section with the final slot allocation table and key notes.

2. Add entry to `context/memory/{date}.md`:

```markdown
## Custom Label Strategy Created
- Job ID: {job_id}
- Slots configured: {list}
- Static labels created: {list with slot + tactic}
- Dynamic labels confirmed: {list with slot + tool}
- Strategy doc: created/feed-optimizer/jobs/{job_id}/output/custom-label-strategy.md
- Import CSV: created/feed-optimizer/jobs/{job_id}/output/import.csv
```

**README format:**

```markdown
# Feed Optimizer Job: {job_id}

Action: custom-label
Date: {date}
Client: {from business.md}

## Strategy Summary
{1-2 sentences on what was done and why}

## Slot Allocation
| Slot | Tactic | Type | Values |
|------|--------|------|--------|
| ... | ... | ... | ... |

## Files
| File | Description |
|------|------------|
| import.csv | Supplemental feed import — id + changed custom label columns |
| diff.csv | All changed rows with old and new values |
| exceptions.csv | Products that could not be assigned |
| custom-label-strategy.md | Full strategy document for this account |

## Notes
- {Any important caveats, e.g., "Margin tiers based on user-provided cost data from 2026-05"}
- {Dynamic labels not touched — managed by ProfitMetrics}
```
