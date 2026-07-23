# Title & Description Flow

Answers: **is the free-text quality good in business context?** All findings are free-text rewrites → `content-maker` → `/feed-optimizer content`. Read `title-desc-rules.md`.

## Inputs

- `module-scores.json` → `modules[title-desc]` (score, band, eligible, affected).
- `context/analysis/feed/title-desc-queue.csv` — per-product title/description findings (reasons in the `finding` column).
- `context/analysis/feed/title-desc-clusters.json` — bounded full-catalog evidence: issue clusters, samples, formulas, source fields, top performer slice.
- `context/analysis/feed/title-desc-brief.md` — operator-readable cluster summary for report drafting.
- `context/feed/cache/title-desc-language-patterns.json` — optional Claude-generated runtime category/term hints for this feed/language.

## Procedure

1. **Language pre-check.** Before running `title-desc` on a localized feed, sample `context/feed/cache/merchant-products-normalized.csv` by `language + target_country + feed_label`. Two runtime extensions (write before analyze, then run):
   - If product types/titles use terms the script cannot classify, write/refine `context/feed/cache/title-desc-language-patterns.json` (catalog-type hints — schema in `title-desc-rules.md`).
   - If the feed's main language is **not** covered by the built-in promo lexicons (`en`/`nl`), write `context/feed/cache/feed-lexicons.json` with that language's promo/boilerplate phrases (schema in `title-desc-rules.md`), so promotional-wording detection works for it instead of falling back to structural-only. Without it, note that promo detection is language-limited for that feed.
2. **Score & band.** Eligible denominator = products with a title.
3. **Separate title vs description** findings (the `attribute` column).
4. **Read bounded evidence first.** Use `title-desc-clusters.json`; do not manually inspect raw product catalogs. The script already scanned every product.
5. **Check pattern coverage.** In `title-desc-clusters.json`, inspect `runtime_language_patterns`, `catalog_profile.classification_sources`, and clusters still classified as `general/fallback`. If important clusters were missed, update the pattern file with the missed terms and rerun.
6. **Apply business context.** Title quality is not just length. Confirm the selected catalog formula from `business.md`, the cluster profile, product type/GPC, language, and samples. Flag generic, keyword-stuffed, unsupported, or promotional copy even when length is fine.
7. **Prioritise.** Use this order:
   - policy/high-risk text issues: promo, ALL CAPS, HTML/URLs, blank descriptions, placeholders.
   - top-50 performer overlap from the business metric/conversions/conversion value slice.
   - largest affected clusters.
   - lower-impact optimisation gaps.
8. **Finalise fixability and write it back.** Findings are stamped `content-maker` by default; where a rewrite is impossible without facts the feed doesn't have, finalise those rows as `source-required` instead. Rewrite the affected rows in `title-desc-queue.csv` (`fixability_class` + `recommended_downstream`, canonical tokens only); the optimizer reads the CSV, not the report.
9. **Handoff.** Route to `/feed-optimizer content`. Include cluster IDs, formula/template, source fields available, missing facts that must not be invented, sample products, top-performer overlap, and whether runtime language patterns were used. No advisory brief; not a deterministic `/feed-optimizer` action (free text is not a static transform).

## Notes

- The content action builds its own worklist by re-running these detectors over the full cache — the module's brief (`title-desc-clusters.json` / `title-desc-brief.md`) steers its prioritisation, formulas, and constraints: which clusters/products, what is wrong, which formula/template to apply, and what facts are safe to use.
- Descriptions: lead with product substance, not store/price boilerplate; no HTML/URLs/promo.
- Never invent product facts. If material, size, model, compatibility, quantity, certification, or claims are unavailable, leave them out or route the missing fact to the source actor in the report narrative.
