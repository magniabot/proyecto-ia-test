# Feed Auditor - Fixability Classes

Every finding in every module queue carries a `fixability_class`. It decides whether the finding becomes a **skill handoff** (a downstream skill can act on it) or an **advisory brief** (only a human/source can act). The script stamps a **provisional** class from cheap signals; **Claude finalises** it using business relevance and the SOPs.

## The five classes

| Class | Meaning | `recommended_downstream` | Output |
|---|---|---|---|
| `optimizer:derivable` | Target value is computable from data already in the feed (parse from title/description, map from another attribute) | `feed-optimizer:<action>` | skill handoff |
| `optimizer:strategy` | CSV-doable but needs a specialist decision first (product_type taxonomy design, `google_product_category` mapping, custom-label strategy) | `feed-optimizer:<action>` | skill handoff |
| `content-maker` | Free-text generation/rewrite (title, description, short_title, product_highlight, product_detail) | `feed-optimizer:content` | skill handoff |
| `source-required` | Value exists nowhere in the feed — needs the source feed / Channable / ecom platform | `advisory-brief` | advisory brief |
| `external` | Image reshoot, price/website mismatch, policy/account fix | `advisory-brief` | advisory brief |

## Canonical downstream tokens (the machine contract)

`recommended_downstream` in every queue CSV must be one of exactly six tokens — the five actions `/feed-optimizer` actually dispatches, plus the advisory lane:

```text
feed-optimizer:product-type
feed-optimizer:taxonomy
feed-optimizer:custom-label
feed-optimizer:small-attributes
feed-optimizer:content
advisory-brief
```

There are **no per-attribute optimizer actions** (`gender`, `color`, `size`, …) — every constrained-attribute fix routes to `feed-optimizer:small-attributes`; the queue's `attribute` column says which attribute. The token set is enforced at emit time in `scripts/lib/modules/shared.js` (`routeFor`/`makeQueueRow`); if the optimizer's action set ever changes, update `OPTIMIZER_ACTIONS` there and this file together.

## Script vs Claude (hybrid)

- **Script (deterministic, provisional):** checks whether the value is present in another field, parseable from title/description, or whether a category→type map exists, and stamps a provisional class.
- **Claude (final):** reviews each provisional class against business relevance and the SOPs and overrides where the script was blunt. Examples Claude should catch:
  - color *is* in the title but in another language → keep `optimizer:derivable`.
  - a "derivable" value would actually be wrong without the source (e.g. ambiguous size) → downgrade to `source-required`.
  - a Merchant disapproval the script marked `external` is actually a missing attribute a CSV can supply → upgrade to `optimizer:derivable`.
- **Claude writes the finalisation back (mandatory).** The optimizer reads the queue CSVs, not the markdown report. Whenever Claude finalises a class differently from the script's provisional stamp, it must rewrite the affected rows in `context/analysis/feed/{module}-queue.csv` — update both `fixability_class` and `recommended_downstream` (use the canonical tokens above) — before sequencing handoffs. A correction that lives only in the report does not exist downstream.

## Routing rules

- `optimizer:derivable` / `optimizer:strategy` → sequence into `/feed-optimizer` (cite the action from `recommended_downstream`).
- `content-maker` → sequence into `/feed-optimizer content`.
- `source-required` / `external` → **never** route to a skill; collect into the module's advisory brief grouped by the actor who must act (source feed / Channable / website / designer / policy owner).

## Guardrails

- Do not claim a finding is `optimizer:derivable` unless the value can be produced **correctly** from feed data — a confident wrong value is worse than an honest gap.
- Image quality is never `optimizer:*`; images are `external`.
- Identifiers (gtin/mpn/brand) are `source-required` unless they already exist elsewhere in the feed.
