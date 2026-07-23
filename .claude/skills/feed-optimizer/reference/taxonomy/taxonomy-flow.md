## Taxonomy Flow (Phases TX-1 through TX-5)

When the action is `taxonomy`, follow these phases. Read `reference/taxonomy/taxonomy-rules.md` for full rules.

### Phase TX-0: Gate (mandatory)

```bash
node .claude/skills/feed-optimizer/scripts/plan.js gate
```

Fails fast on missing or stale (>24h) feed-auditor evidence — route to `/feed-auditor` and do not
proceed. Every later `plan.js` phase re-checks freshness internally, so stale data fails there too.

### Phase TX-1: Setup & Taxonomy Fetch

1. Fetch and cache the Google product taxonomy:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=fetch-taxonomy
```

The script fetches `taxonomy-with-ids.en-US.txt` from Google and caches it locally. If a cached version exists and is less than 30 days old, it uses the cache.

2. Read `context/feed/cache/merchant-products-normalized.json`.

3. Run GPC distribution analysis:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=gpc-distribution
```

Report to the specialist:
- Current GPC value distribution (how many products per GPC ID, with resolved English paths)
- Product type coverage percentage

If product type coverage is below 50%, recommend:

> "Product type coverage is {pct}%. GPC assignment will be more accurate after a product-type cleanup. You can run `/feed-optimizer product-type` first, or proceed now with title keywords as the primary signal. Continue?"

Wait for the specialist to confirm before proceeding.

### Phase TX-2: Clustering

Run clustering:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=cluster \
  [--job-id={job_id}]
```

The script clusters products using this signal priority:
1. Existing `product_type` (primary) — groups by top-level product type
2. Current `google_product_category` (secondary) — for products without product type
3. Title keywords (tertiary) — for products with neither

Present clusters to the specialist:
- Cluster name, source signal, product count
- Current GPC distribution within each cluster (to show whether current values are consistent or scattered)
- Sample product titles
- Top product type paths if present

### Phase TX-3: GPC Assignment (interactive)

1. Read `context/business.md` to understand the business vertical, B2B/B2C split, what they sell, and who they sell to. Use this to filter GPC candidates — a B2B packaging supplier's products belong in "Business & Industrial" or "Office Supplies" branches, not consumer categories like "Home & Garden."

2. For each cluster, find candidate GPC categories:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=search-taxonomy \
  --keywords="keyword1,keyword2,keyword3"
```

The script searches the cached taxonomy file and returns the top 10 matching categories with IDs, paths, and match scores.

3. Review the script's candidates. Filter out categories that don't match the business context (e.g., consumer categories for a B2B client). Add any categories from your own knowledge that the keyword search may have missed. Select the best-fit GPC for each cluster.

Present the full assignment table to the specialist in one batch:

| Cluster | Products | Current GPC | Proposed GPC ID | Proposed GPC Path |
|---------|----------|-------------|-----------------|-------------------|
| ... | ... | ... | ... | ... |

Then ask targeted questions only where input is needed:
- Clusters where 2-3 candidate categories are equally plausible
- Clusters where no good match was found
- Clusters with mixed products that may need splitting

The specialist reviews the table, answers questions, flags disagreements, and approves.

If the specialist wants to split a cluster, break it into sub-clusters and re-propose GPCs for each.

### Phase TX-4: Mapping Table & Review

After the specialist approves all GPC assignments, expand them to the per-product mapping table **mechanically** — never write per-product rows by hand; that does not scale past small catalogs.

1. Author the **cluster-level decision file** (~one row per cluster, not per product):

```text
created/feed-optimizer/jobs/{job_id}/cluster-assignments.json
```

```json
{
  "assignments": {
    "Dozen": "6175",
    "(current GPC) Office Supplies > Shipping Supplies": "543543",
    "(uncategorized)": null
  },
  "overrides": {
    "157694603": "499876"
  }
}
```

Rules:
- `assignments` must cover **every** populated cluster in `cluster-summary.json` by exact name — the script fails fast on missing or unknown cluster names.
- Values are **numeric GPC IDs** (as strings). Every ID is resolved against the cached Google taxonomy — unknown IDs fail the run before anything is written.
- A `null` assignment routes that cluster's products to exceptions.
- `overrides` maps individual `product_id`s to a GPC ID, taking precedence over their cluster assignment (use for split-cluster decisions).

2. Run the apply phase:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=apply-mapping \
  --job-id={job_id}
```

The script joins the decision file against the cluster membership and the merchant cache, resolves old and new GPC IDs to English paths, and writes:

```text
created/feed-optimizer/jobs/{job_id}/mapping-table.csv
created/feed-optimizer/jobs/{job_id}/exceptions.csv
```

Mapping table columns: `product_id,title,feed_label,target_country,old_gpc_id,old_gpc_path,new_gpc_id,new_gpc_path,cluster_name,changed`

3. Review the script's printed summary and 20-row diff sample, then present the mapping summary to the specialist: total products, products changed, products unchanged, exceptions.

Stop here until the specialist approves the mapping table.

### Phase TX-5: Final CSV Outputs

Only after explicit specialist approval, run finalize:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=taxonomy \
  --phase=finalize \
  --job-id={job_id}
```

It mechanically writes, for each market (feed_label + target_country combination) found in the approved mapping table:

```text
created/feed-optimizer/jobs/{job_id}/output/import-{feed_label}-{country}.csv   (id,google_product_category — changed rows only, numeric GPC IDs)
created/feed-optimizer/jobs/{job_id}/output/diff.csv                            (all changed rows with old and new GPC IDs and paths)
created/feed-optimizer/jobs/{job_id}/output/exceptions.csv
created/feed-optimizer/jobs/{job_id}/output/README.md                           (job summary — extend with strategy notes if useful)
```

After writing, build `created/feed-optimizer/jobs/{job_id}/output/diff.html` from `diff.csv` per
`reference/shared/review-html.md` (branded, self-contained, read-only — a before/after GPC mapping
table showing old→new category path + ID) and `open` it so the specialist reviews the change set in
the browser. The CSV stays the import source of truth; if building the HTML fails, point them at the
CSV.
