# Feed Optimizer - Product Type Rules

Runtime reference for the `product-type` action. Read this file in Phase 1 when the action is `product-type`. This replaces the "Product Type Cleanup" section in `transformation-rules.md` for product-type work.

## What Product Type Is

Product type (`product_type`) is the **merchant's own catalog taxonomy**. It defines how the merchant organizes their products for campaign structure, listing groups, and bid segmentation. It is NOT Google Product Category — GPC is Google's taxonomy for ad serving. Do not copy GPC into product type.

## Structure Rules

- Separator: ` > ` (space, greater-than, space). Always.
- Maximum depth: 5 levels. Hard limit.
- Default depth: 3 levels. Only go to 4-5 when there is genuine segmentation need at that level.
- Maximum characters: 750 per path.
- Every level must add segmentation value — if removing a level doesn't lose meaningful distinction, remove it.

## Approach: Full Taxonomy Redesign

The `product-type` action is a full taxonomy redesign, not a gap-fill. ALL products go through the new taxonomy tree, including products that already have `product_type` values. The specialist designs the definitive structure.

Rationale: partial gap-fill inherits existing inconsistencies (duplicate paths, random depths, products miscategorized over time). A full redesign produces a clean, consistent taxonomy.

## Multi-Language Handling

### Language Detection

1. Read `context/feed/cache/merchant-products-normalized.json`.
2. Group products by `language` field. Count products per language.
3. Report the language distribution to the specialist.
4. Auto-detect primary language as the one with the most products.
5. Ask the specialist to confirm or override the primary language.

### Stop Word Generation

Before clustering, generate language-specific stop words:

1. For each detected language, extract the top 100 most frequent title terms (tokens: lowercase, split on whitespace and punctuation, 3+ characters, no pure numbers).
2. Write these terms to the specialist with the language code.
3. Using knowledge of the language, classify each term as:
   - **skip**: function words, articles, prepositions, conjunctions, color adjectives, size/dimension words, unit words (mm, cm, stuks, etc.), brand noise, generic modifiers
   - **keep**: product-identifying nouns, material names, product category words
4. Write the classified stop words to `.claude/skills/feed-optimizer/tmp/stop-words.json` in this format:

```json
{
  "nl": ["de", "het", "een", "voor", "met", "wit", "zwart", "groot", "klein", "mm", "cm", "stuks"],
  "fr": ["le", "la", "les", "un", "une", "des", "pour", "avec", "blanc", "noir"],
  "de": ["der", "die", "das", "ein", "eine", "für", "mit", "weiß", "schwarz"]
}
```

5. The clustering script reads this file. If it does not exist, the script falls back to statistical stop word detection (terms appearing in >40% of products in that language).

### Per-Language Clustering and Taxonomy

Clustering and taxonomy design happen **per language**. Each language segment gets its own clusters and its own taxonomy tree with labels in that language.

### Primary Language First

1. Design the full taxonomy tree in the primary language. This is the interactive session with the specialist.
2. Once approved, translate the taxonomy tree to each additional language.
3. Present a side-by-side translation map for specialist review.
4. The specialist approves or corrects translations before final CSV generation.

## Clustering

### Signal Priority

1. **Existing `product_type` values** — strongest signal of merchant intent. Products that already have a product type reveal the merchant's categorical thinking. Group these first.
2. **Title keyword patterns** — for products without product type, extract frequent title terms (after stop word filtering) and cluster by dominant term.
3. **Google Product Category** — NOT a product type source, but a loose secondary signal when nothing else matches. Use only to explain a cluster, never to populate product type directly.

### Cluster Presentation

Present clusters to the specialist showing:
- Cluster name and source (existing taxonomy vs. keyword-derived)
- Product count (typed + blank)
- Existing product type paths in the cluster (with counts)
- Sample product titles (both typed and blank)

### Handling the "(uncategorized)" Bucket

Products that don't cluster clearly go into an uncategorized group. The specialist must explicitly assign these — either to an existing cluster or to a new branch. Do not silently skip them.

## Taxonomy Design Conversation

This is an interactive session. The specialist decides the tree structure. Claude's role:

1. Present the clusters.
2. For each cluster, suggest where it fits in the tree based on the existing structure and product types.
3. For blank/keyword clusters, ask the specialist what category these products belong to.
4. Build the tree incrementally as the specialist makes decisions.
5. Show the tree after each assignment so the specialist sees the evolving structure.

### Flattening Proposals

When an existing product type path has 4+ levels:
- Propose a flatter alternative.
- Explain which middle levels can be removed without losing segmentation value.
- The specialist decides — never auto-flatten.

Example:
```
Current:  Clothing > Women > Tops > Casual Wear > T-Shirts (5 levels)
Proposed: Clothing > Women > T-Shirts (3 levels)
Reason:   "Tops" and "Casual Wear" don't add campaign segmentation value — you wouldn't create separate listing groups or bid differently for casual vs. non-casual t-shirts.
```

The specialist may disagree and keep the depth. That's fine.

### Branch Viability

A branch is justified at any volume when the products are **categorically distinct** — they cannot logically fit under a sibling or parent branch.

Example: 100 shoes, 50 t-shirts, 2 jackets → jackets get their own branch. They are categorically distinct.

Only propose merging low-volume branches when the products could logically fit elsewhere. Never merge just to hit a volume threshold.

## Translation Workflow

After the primary language taxonomy is approved:

1. For each additional language, translate the taxonomy tree labels.
2. Write a translation map CSV: `primary_path,{lang}_path` for every path.
3. Present the side-by-side mapping to the specialist for review.
4. The specialist corrects any translations before approval.
5. Product category names can be tricky across languages — literal translation is often wrong. Use the correct product terminology in each language.

## Script vs Claude Responsibility

The `plan.js` script handles the deterministic phases:
- `--phase=detect-languages` — counts products per language field
- `--phase=extract-terms` — extracts high-frequency title terms for a language
- `--phase=cluster` — clusters products using stop words file, writes cluster summary JSON
- `--phase=apply-mapping` — expands the Claude-authored cluster-assignments decision file to the per-product mapping table + exceptions CSV
- `--phase=finalize` — writes the final import CSVs, diff, exceptions, and README from approved mapping tables

Claude's responsibility, using the Write tool:
- Classifying stop words (requires language knowledge)
- Taxonomy design conversation (requires domain judgment)
- Translation (requires multilingual knowledge)
- Authoring the cluster-level decision file `cluster-assignments-{lang}.json` (cluster→path assignments from the design session, plus per-product overrides)
- Writing the taxonomy tree markdown and translation map

This split keeps the division of labor at the right altitude: **Claude decides at cluster level, the script applies at product level.** Claude handles anything that requires language understanding, domain judgment, or interactive decision-making with the specialist; the script handles anything that is one row per product, so the flow scales to catalogs of any size.

## Output Files

For `product-type` jobs, the output structure is:

### Planning phase (per language):

```
created/feed-optimizer/jobs/{job_id}/
  cluster-summary-{lang}.json
  cluster-assignments-{lang}.json   (Claude-authored decision file: cluster→path + overrides)
  mapping-table-{lang}.csv          (script-expanded, per product)
  taxonomy-tree-{lang}.md
  translation-map.csv               (only for multi-language feeds)
  exceptions-{lang}.csv             (script-expanded, per product)
```

### Final phase (per language, per market):

```
created/feed-optimizer/jobs/{job_id}/output/
  import-{lang}-{feed_label}-{country}.csv
  taxonomy-tree-{lang}.md
  translation-map.csv            (only for multi-language feeds)
  diff.csv
  exceptions.csv
  README.md
```

The `taxonomy-tree-{lang}.md` is a human-readable reference document the specialist can share with the client or keep for future product additions.
