# Feed Optimizer - Handoff Matrix

Use the latest `feed-auditor` outputs and its peer-aware notes before proposing work. The auditor emits **per-module queues** (`{errors,completeness,attributes,title-desc,images}-queue.csv`) plus `module-scores.json` — there is no combined `feed-action-queue.csv`. Each finding carries `fixability_class` and `recommended_downstream`. Only act on `optimizer:derivable` / `optimizer:strategy` findings.

| Condition | Action |
|---|---|
| No fresh merchant cache or `module-scores.json` (the two required anchors) | Stop and run `/feed-auditor`. |
| Missing relevant constrained attributes (color, size, material, pattern, gender, age_group, size_type, size_system, brand, dimensions) | Route to `/feed-optimizer small-attributes` — LLM-extracts values from image + title + description (abstains when unsupported). |
| Finding `fixability_class` is `content-maker` (title/description/short_title/highlights/details) | Route to `/feed-optimizer content` — rewrites weak `title`/`description` (only when the auditor's detectors flag them) and backfills missing `short_title`/`product_highlight`/`product_detail`, grounded in existing feed facts; sample-gated, supplemental-feed output with old→new diff. |
| Finding `fixability_class` is `source-required` or `external` | Leave for the auditor's advisory brief; not a CSV transform. The small-attributes action also routes its own abstentions (no evidence) into its exceptions file for the same source/advisory follow-up. |
| Merchant setup or feed eligibility remains blocked | Stop and follow the feed audit handoff. |
| Required fields or product type cleanup is the main issue | Continue with reviewed CSV mapping. |
| Title or description rewriting is needed | Route to `/feed-optimizer content`. |
| Image interpretation for a constrained attribute value (e.g. color) | Route to `/feed-optimizer small-attributes` (always sends the image). |
| Image interpretation for prose/copy | Route to `/feed-optimizer content`. |
| Dynamic labels are requested (performance, real-time inventory, price competitiveness, composite scoring) | Do not create CSV. Recommend the appropriate tool: ProfitMetrics (profit-based), Channable or ProductHero Labelizer (performance-based), feed management tool (inventory/pricing). |
| Margin labels are requested without reliable margin input | Ask for a margin source (e.g. `product_id,margin_tier` or `product_id,cost`) or route to `/strategy-specialist`. Never fabricate margin tiers. |
| Custom label strategy needed | Route to `/feed-optimizer custom-label` for holistic strategy + static label creation. |
| Source feed export is requested | Explain that source feed exports are outside v1 scope. |

## Sequencing

1. Fix eligibility and required field blockers first.
2. Clean product type and static taxonomy infrastructure next.
3. Backfill missing constrained attributes with `/feed-optimizer small-attributes` (LLM extraction, sample-gated, supplemental-feed output).
4. Run custom label strategy (`/feed-optimizer custom-label`) to design and fill static labels.
5. Send long-form content generation (titles, descriptions, highlights, details) to `/feed-optimizer content`.
6. Keep performance prioritization as an overlay, not the root reason for static label changes. Performance labels (`hero`, `sidekick`, `villain`, `zombie`, `unclassified`) are diagnostic evidence — never the source of a standard static upload CSV.
