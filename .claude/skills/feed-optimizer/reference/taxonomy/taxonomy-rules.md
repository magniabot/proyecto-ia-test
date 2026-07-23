# Feed Optimizer - Taxonomy Rules

Runtime reference for the `taxonomy` action. Read this file in Phase 1 when the action is `taxonomy`.

## What Google Product Category Is

Google product category (`google_product_category`) is **Google's own classification taxonomy** for ad serving, targeting, and policy enforcement. It determines which product ads show for which queries and which policies apply.

GPC is NOT the merchant's catalog structure — that is `product_type`. Do not copy product type paths into GPC. Do not invent GPC paths — only values from Google's official taxonomy are valid.

## Format Rules

- **Accepted formats**: numeric ID (preferred) or full English path
- **This skill always exports numeric IDs** — they are stable across taxonomy versions and language-neutral
- **Source of truth**: `https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt`
- **IDs are universal** — the same ID maps to the same category in every language (EN, NL, FR, DE, etc.)

## When to Override GPC

Google auto-categorizes products and does a reasonable job for many products. Override GPC when:

- Auto-categorization is **wrong** (product is a toner cartridge, GPC says "Packing Materials")
- Auto-categorization is **too broad** (product is a specific type of headphone, GPC says "Electronics")
- Multiple unrelated products share the **same incorrect GPC** (bulk misassignment, often from feed setup)
- Products are getting **disapproved** due to wrong category (policy enforcement depends on GPC)

Do not override when auto-categorization is correct or close enough — unnecessary overrides add maintenance burden.

## Specificity

Always assign the most specific (deepest) category that accurately describes the product. If a product is a "wireless Bluetooth headphone," use the specific headphone category, not the generic "Audio" parent.

However, do not force specificity when products span multiple sub-categories within a cluster. It is acceptable to use a parent category when the cluster genuinely contains a mix of sub-types and splitting would not improve accuracy.

## Clustering Signal Priority

1. **Existing `product_type`** — strongest signal. Products with the same product type top-level likely need the same or similar GPC. The merchant's own categorization reveals product identity.
2. **Current `google_product_category`** — for products without product type. Groups products by Google's current (possibly wrong) assignment. Useful to see if all products in a GPC actually belong there.
3. **Title keywords** — for products with neither product type nor useful GPC. Weakest signal, requires the most Claude judgment.

## Business Context Awareness

Before proposing GPCs, read `context/business.md` to understand:

- **Vertical** (ecommerce, lead gen, SaaS)
- **B2B vs B2C** — B2B products belong in "Business & Industrial" categories, not consumer equivalents like "Home & Garden"
- **What they sell** — the business description narrows which top-level taxonomy branches are relevant
- **Who they sell to** — target audience determines whether a product is industrial, commercial, or consumer

When the script returns multiple candidate GPCs, use business context to pick the right branch. A packaging supplier's food containers belong in "Business & Industrial > Food Service > Disposable Tableware," not "Home & Garden > Kitchen & Dining > Food Storage."

## Matching Approach

For each cluster:

1. Read `context/business.md` to understand the business vertical and audience.
2. The script searches the cached taxonomy file using keywords derived from the cluster name, product types, and sample titles.
3. Claude reviews script candidates, filters by business context relevance, and adds any categories from domain knowledge that keyword search missed.
4. Claude proposes the best-fit GPC with ID and full English path.
5. The specialist approves or overrides.

## Specialist Interaction

Present the full assignment table as a batch. Only ask targeted questions where genuine ambiguity exists:

- Two or more candidate GPCs are equally valid for a cluster
- No good GPC match was found — ask the specialist what these products are
- A cluster contains mixed products that need splitting into separate GPC assignments

Never ask a question when the match is obvious. The specialist should spend time on decisions, not confirmations.

## Cluster Splitting

The specialist may request splitting a cluster when it contains products that need different GPCs. When splitting:

1. Ask the specialist how to divide the products (by keyword, by sub-type, or manually)
2. Create sub-clusters and re-propose GPCs for each
3. Update the assignment table

## Product Type Coverage Recommendation

If less than 50% of products have a `product_type` value, recommend running `/feed-optimizer product-type` first. A clean product type taxonomy dramatically improves GPC assignment accuracy. This is a recommendation, not a gate — the specialist decides.

## Taxonomy Cache

The Google taxonomy file is cached at `.claude/skills/feed-optimizer/tmp/google-taxonomy-en.txt`.

- Fetched on first run
- Re-fetched if older than 30 days
- Falls back to cached version if fetch fails (after first run)
- Always uses the English (en-US) version regardless of feed language

## Output Contract

### Planning phase
- `mapping-table.csv` — full mapping with old/new GPC IDs and paths
- `cluster-summary.json` — cluster details for review
- `exceptions.csv` — products that could not be assigned

### Final phase (per market)
- `import-{feed_label}-{country}.csv` — `id,google_product_category` (ID format)
- `diff.csv` — changed rows with old and new values
- `exceptions.csv` — unmapped products
- `README.md` — final job summary
- in the file you will have an `id` and a `google_product_category` column

## Boundaries

- This action writes `google_product_category` values only
- It does not set `product_type` — that is a separate action
- It does not set custom labels — those are separate actions
- It does not modify Merchant Center, Google Ads, or any upstream system
- Only values from Google's official taxonomy are valid — never invent categories
