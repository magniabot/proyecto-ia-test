## Product Type Flow (Phases PT-1 through PT-6)

When the action is `product-type`, follow these phases. Read `reference/product-type-rules.md` for full rules.

### Phase PT-0: Gate (mandatory)

```bash
node .claude/skills/feed-optimizer/scripts/plan.js gate
```

Fails fast on missing or stale (>24h) feed-auditor evidence — route to `/feed-auditor` and do not
proceed. Every later `plan.js` phase re-checks freshness internally, so stale data fails there too.

### Phase PT-1: Language Detection and Stop Words

1. Read `context/feed/cache/merchant-products-normalized.json`.
2. Run language detection:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=product-type \
  --phase=detect-languages
```

The script outputs language distribution. Report it to the specialist:

> "Found 1,800 products in NL, 200 in FR, 150 in DE. Using NL as the primary language. Correct?"

Wait for the specialist to confirm or override the primary language.

3. For each detected language, extract the top 100 high-frequency title terms using the script:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=product-type \
  --phase=extract-terms \
  --language={lang}
```

4. Review the extracted terms. Using knowledge of the language, classify each term as **skip** (function words, colors, sizes, units, generic modifiers) or **keep** (product-identifying nouns, material names, category words).

5. Write the classified stop words to `.claude/skills/feed-optimizer/tmp/stop-words.json`:

```json
{
  "nl": ["de", "het", "een", "voor", "met", ...],
  "fr": ["le", "la", "les", "un", "pour", ...]
}
```

### Phase PT-2: Clustering

Run clustering for the primary language:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=product-type \
  --phase=cluster \
  --language={primary_lang} \
  [--job-id={job_id}]
```

The script reads the stop words file and writes:

```text
created/feed-optimizer/jobs/{job_id}/cluster-summary-{lang}.json
```

Present the clusters to the specialist:
- Cluster name, source (existing taxonomy vs. keyword-derived), product count
- Existing product type paths with counts and depths
- Sample product titles (typed and blank)
- Flag any existing paths deeper than 3 levels with flattening proposals

### Phase PT-3: Taxonomy Design

Interactive session with the specialist. For each cluster:

1. If the cluster comes from existing taxonomy, propose keeping, flattening, or restructuring the paths.
2. If the cluster is keyword-derived, ask the specialist what category these products belong to.
3. For the uncategorized bucket, review products individually and assign them.

Build the taxonomy tree incrementally. After each assignment, show the evolving tree structure.

Rules during design:
- Default to 3 levels. Only go to 4-5 when the specialist explicitly needs deeper segmentation.
- Every level must add segmentation value for campaign management.
- A branch is viable at any volume if the products are categorically distinct.
- Only propose merging low-volume branches when products could logically fit elsewhere.

When the full tree is designed for the primary language, write it:

```text
created/feed-optimizer/jobs/{job_id}/taxonomy-tree-{lang}.md
```

Stop and confirm with the specialist: "Here is the final taxonomy tree for {lang}. Approve before proceeding to translation/mapping?"

### Phase PT-4: Translation (multi-language feeds only)

Skip this phase for single-language feeds.

1. For each additional language, translate the approved taxonomy tree.
2. Use correct product terminology in each language — do not translate literally.
3. Write a translation map CSV:

```text
created/feed-optimizer/jobs/{job_id}/translation-map.csv
```

Format: `primary_path,{lang1}_path,{lang2}_path,...`

4. Present the side-by-side translation map to the specialist for review.
5. Wait for approval or corrections before proceeding.
6. After approval, run clustering and mapping for each additional language using the translated tree.

### Phase PT-5: Build Mapping Tables

After taxonomy approval (and translation approval for multi-language feeds), expand the approved taxonomy to per-product mapping tables **mechanically** — never write per-product rows by hand; that does not scale past small catalogs.

1. For each language, author the **cluster-level decision file** (this is the Claude-authored artifact — ~one row per cluster, not per product):

```text
created/feed-optimizer/jobs/{job_id}/cluster-assignments-{lang}.json
```

```json
{
  "language": "nl",
  "assignments": {
    "Dozen": "Verpakkingen > Dozen",
    "Enveloppen": "Verpakkingen > Enveloppen",
    "(uncategorized)": null
  },
  "overrides": {
    "157694603": "Verpakkingen > Disposables"
  }
}
```

Rules:
- `assignments` must cover **every** populated cluster in `cluster-summary-{lang}.json` by exact name — the script fails fast on missing or unknown cluster names.
- A `null` assignment routes that cluster's products to exceptions (use for clusters the specialist chose not to map).
- `overrides` maps individual `product_id`s to a path, taking precedence over their cluster assignment — use it for the PT-3 individual assignments from the uncategorized bucket.
- Every path is validated (max 5 levels, max 750 chars) — invalid paths fail the run before anything is written.

2. Run the apply phase:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=product-type \
  --phase=apply-mapping \
  --language={lang} \
  --job-id={job_id}
```

The script joins the decision file against the cluster membership and the merchant cache, and writes:

```text
created/feed-optimizer/jobs/{job_id}/mapping-table-{lang}.csv   (per-product rows)
created/feed-optimizer/jobs/{job_id}/exceptions-{lang}.csv      (unmapped products)
```

Mapping table columns: `product_id,feed_label,target_country,language,title,old_product_type,new_product_type,cluster_name,changed`

3. Review the script's printed summary (totals, changed/unchanged, exceptions) and the 20-row diff sample. Spot-check the sample against the approved taxonomy — you review the slice and the stats, not every row.

4. Present the mapping summary per language to the specialist: total products, products changed, products unchanged, exceptions (with the exception reasons).

Stop here until the specialist approves all mapping tables.

### Phase PT-6: Final CSV Outputs

Only after explicit specialist approval of all mapping tables, run finalize:

```bash
node .claude/skills/feed-optimizer/scripts/plan.js \
  --action=product-type \
  --phase=finalize \
  --job-id={job_id}
```

It mechanically writes, for each language and market combination found in the approved mapping tables:

```text
created/feed-optimizer/jobs/{job_id}/output/import-{lang}-{feed_label}-{country}.csv   (id,product_type — changed rows only)
created/feed-optimizer/jobs/{job_id}/output/diff.csv                                   (all changed rows across all languages)
created/feed-optimizer/jobs/{job_id}/output/exceptions.csv                             (all unmapped products)
created/feed-optimizer/jobs/{job_id}/output/README.md                                  (job summary — extend with strategy notes if useful)
```

It also copies `taxonomy-tree-{lang}.md` and `translation-map.csv` (multi-language only) from the planning dir into the final dir.

After writing, build `created/feed-optimizer/jobs/{job_id}/output/diff.html` from `diff.csv` per
`reference/shared/review-html.md` (branded, self-contained, read-only — a before/after product-type
mapping table) and `open` it so the specialist reviews the change set in the browser. The CSV stays
the import source of truth; this is a convenience layer — if it fails, just point them at the CSV.
