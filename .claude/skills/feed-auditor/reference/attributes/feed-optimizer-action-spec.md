# Downstream contract: /feed-optimizer actions

The auditor routes CSV-fixable findings to `/feed-optimizer` via the `recommended_downstream` column. The optimizer dispatches exactly **five** actions; every optimizer-bound token must name one of them (enforced in `scripts/lib/modules/shared.js`):

```text
feed-optimizer:product-type
feed-optimizer:taxonomy
feed-optimizer:custom-label
feed-optimizer:small-attributes
feed-optimizer:content
```

Anything not CSV-fixable routes to `advisory-brief` instead — never to the optimizer.

Shared queue columns the optimizer can rely on: `product_id`, `attribute`, `finding`, `fixability_class`, `recommended_downstream`, `confidence`, `severity`, `feed_label`, `target_country`, `language`.

## Action map

| Action | Triggered by | fixability_class | How the optimizer consumes it |
|---|---|---|---|
| `product-type` | `product_type` flat / shallow / over-length / missing | `optimizer:strategy` (or `optimizer:derivable` when GPC exists) | Reads the queue subset; deterministic mapping job. |
| `taxonomy` | `google_product_category` non-canonical / missing / Merchant-flagged category issues | `optimizer:strategy` | Reads the queue subset; deterministic mapping job against the official Google taxonomy. |
| `custom-label` | `custom_label_*` low-quality / over-length | `optimizer:strategy` | Reads the queue subset; strategy interview + static-label CSVs. |
| `small-attributes` | Invalid / low-quality / missing **constrained attribute values**: `gender`, `age_group`, `color`, `material`, `size`, `size_system`, `size_type`, `pattern`, `condition` | `optimizer:derivable` | Builds its worklist from the **full** `merchant-products-normalized.json` via the auditor's relevance engine; the queue rows enrich tags and prioritization, they are not the worklist. The `attribute` column says which attribute each finding concerns. |
| `content` | Weak / policy-flagged `title`/`description`; missing `short_title`/`product_highlight`/`product_detail` | `content-maker` | Re-runs the auditor's detectors over the full cache to build its worklist; the title-desc queue, `title-desc-clusters.json`, and `title-desc-brief.md` steer prioritization, formulas, and constraints. |

There are **no per-attribute optimizer actions** (`gender`, `color`, `size`, …). All constrained-attribute value work is served by the single `small-attributes` action.

> `small-attributes` and `content` MUST honour the "never fabricate" rule: if a correct value cannot be justified from feed data (image + title + description), abstain — the auditor already routes truly underivable cases to the advisory lane instead.

## Not optimizer work (advisory brief, for reference)

`gtin` (GS1), `certification`, `id`, `brand`, `mpn`, measures, dates, energy classes, destinations, and dependency gaps route to `attributes-advisory-brief.md` for a human/source/external actor — **not** to `/feed-optimizer`.
