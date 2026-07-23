# Feed Auditor - Handoff Matrix

Handoffs are driven by each finding's `fixability_class` (see `fixability-classes.md`) and sequenced by cascade. Before recommending a peer audit, check fresh peer report status and inspect fresh reports when relevant.

## Module → downstream

| Module | Typical fixability | Handoff | Notes |
|---|---|---|---|
| Account-health (gate) | blocker | `/merchant-auth <client>` | Only on `gate: block` (unclaimed homepage, suspended/critical account issue). |
| Errors | mostly `external` / `source-required`; some `optimizer:strategy` / `content-maker` | advisory brief; `/feed-optimizer taxonomy` for flagged category issues; `/feed-optimizer content` for flagged title/description issues | Most disapprovals need source/site/policy fixes — do not pretend the optimizer can clear a policy strike. |
| Completeness | `optimizer:derivable` / `optimizer:strategy` / `content-maker` / `source-required` | `/feed-optimizer small-attributes` for derivable constrained-attribute gaps; `product-type`/`taxonomy` for classification gaps; `/feed-optimizer content` for missing free-text (`short_title`/`product_highlight`/`product_detail`); advisory brief for source-required | Confirm attribute relevance with the user first. |
| Attributes | `optimizer:derivable` / `optimizer:strategy` (CSV-fixable) **and** `source-required` / `external` (advisory) | `/feed-optimizer` — `product-type`, `taxonomy`, `custom-label` for strategy findings; `small-attributes` for all constrained-attribute value fixes (gender, age_group, color, material, size, size_system, size_type, pattern, condition) — advisory brief for `gtin`/`certification`/`brand`/measures/dates/dependency gaps | Order by `severity` (critical→optional). See `reference/attributes/feed-optimizer-action-spec.md` for the downstream contract. |
| Title & Description | `content-maker` | `/feed-optimizer content` | Pass the cluster brief (`title-desc-clusters.json` / `title-desc-brief.md`) along with the queue. |
| Images | `external` | advisory brief | Designer/source action; never a skill route. |
| Performance | deferred | — | Future; price competitiveness is its own future skill. |

The only valid `recommended_downstream` tokens in the queues are `feed-optimizer:{product-type|taxonomy|custom-label|small-attributes|content}` and `advisory-brief` (see `fixability-classes.md`). Finalised fixability must be written back to the queue CSVs before handoffs are sequenced — the optimizer reads the CSVs, not the report.

## Peer reports (Cross-Skill Audit Cohesion)

| Need | Handoff | Existing report | Fresh window |
|---|---|---|---:|
| Measurement confidence for performance context | `/tracking-specialist` | `context/analysis/tracking-audit.md` | 30 days |
| Business-weighted prioritization | `/strategy-specialist` | `context/analysis/strategy-audit.md` | 30 days |
| Bidding context | `/bidding-auditor` | `context/analysis/bidding-audit.md` | 7 days |
| Budget context | `/budget-auditor` | `context/analysis/budget-audit.md` | 7 days |
| Account setup | `/account-auditor` | `context/analysis/account-audit.md` | 30 days |

## Phrasing rules

- Fresh peer report exists: cite it; do not ask for a redundant audit.
- Stale peer report: mention age; recommend rerun only if current state matters.
- Missing peer report: recommend only when feed evidence needs that layer.
- Feed-quality fixes can proceed without strategy context. Business-weighted prioritization cannot.
- When a finding is `source-required` or `external`, point to the advisory brief and name the actor — never imply a skill will fix it.
