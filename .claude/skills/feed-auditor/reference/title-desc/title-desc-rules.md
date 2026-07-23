# Title & Description Rules

## Evidence budget

- The script scans the full catalog and writes bounded evidence to `context/analysis/feed/title-desc-clusters.json`.
- Claude reads clusters, capped samples, and the top-performer slice. Do not inspect raw 3k-4k product catalogs manually.
- Product-level detail remains in `context/analysis/feed/title-desc-queue.csv` for downstream batch processing.
- Optional runtime language/category hints live in `context/feed/cache/title-desc-language-patterns.json`.

## Business and category classification

Classify the catalog before judging titles. Use `context/business.md`, `module-scores.json` business profile, `product_type`, `google_product_category`, brand/category distribution, market/language, and title samples.

The script does not carry a hardcoded multilingual category dictionary. When product types/titles are in a language where the script cannot classify enough products, Claude should create or refine `context/feed/cache/title-desc-language-patterns.json` from a quick manual feed sample, then rerun analysis.

If confidence is low, use the General formula and mark the handoff lower-confidence. Keep different languages, countries, or feed labels separate when title/description patterns differ.

## Runtime language pattern file

Use this file to bootstrap language-aware classification for the current client/feed only. Treat it as cached evidence, not global skill logic.

```json
{
  "generated_at": "2026-05-31T12:00:00.000Z",
  "source": "Claude manual sample of merchant-products-normalized.csv",
  "patterns": [
    {
      "id": "nl-packaging-terms",
      "language": "nl",
      "target_country": "NL",
      "feed_label": "NL",
      "catalog_type": "general",
      "fields": ["product_type", "title"],
      "terms": ["verpakkingstape", "noppenfolie", "verzenddoos"],
      "confidence": "manual-sample"
    }
  ]
}
```

Supported `catalog_type` values are `fashion_apparel`, `electronics`, `consumables_health_beauty`, `home_furniture`, `books_media`, `seasonal_occasion`, `sports_outdoors`, `automotive`, and `general`.

Rules:

- Scope every pattern by `language`, `target_country`, and/or `feed_label` when possible.
- Keep terms concise and product/category-specific; do not add broad words that match everything.
- Use `fields` to limit where terms are matched. Prefer `product_type` and `title`.
- Cap each pattern to the smallest useful term list. If coverage is poor after a run, add the missed terms and rerun.
- Do not use runtime terms to invent product facts. They only select the SOP formula/template.

## Title formulas

| Catalog type | Formula |
|---|---|
| Fashion / apparel | Brand + Gender + Product type + Attributes (color/size/material) |
| Electronics | Brand + Attributes + Product type + Model |
| Consumables / health & beauty | Brand + Product type + Attributes (weight/amount/flavor) |
| Home & furniture | Brand + Product type + Attributes (size/material/color) + Style |
| Books & media | Title + Author + Format + ISBN |
| Seasonal / occasion | Occasion + Product type + Attributes |
| Sports & outdoors | Brand + Product type + Attributes (size/weight/material) + Use case |
| Automotive | Year/Make/Model compatibility + Product type + Brand + Attributes |
| General fallback | Brand + Product type + Key attribute + Differentiator |

## Title checks

- Front-load the core terms for the selected formula.
- Aim for ~70-100 visible characters when facts support it; 150 is the hard maximum. Length is guidance, not a defect — a concise 30-150 char title is NOT a finding.
- The script flags only <30 characters (very short) and >150 (truncation risk). It no longer penalises the 30-70 band; judge length qualitatively against the formula instead.
- Promotional wording is flagged **per the product's content language** (`product.language`). The script carries built-in `en`/`nl` promo lexicons plus a language-agnostic "N% off / save N" pattern, and skips lexical promo checks for uncovered languages. Matches inside the brand value are ignored (e.g. brand "Free People").
- **Extend coverage at runtime (no source edit).** When the feed's main language isn't covered, Claude can add promo/boilerplate words for that language by writing `context/feed/cache/feed-lexicons.json` **before** running `analyze` — the additions merge on top of the built-ins, scoped to this client. Sample a handful of titles/descriptions first to collect the real marketing phrases, then add them. Schema (all optional, case-insensitive substrings, language keys are normalized — `de`, `de-AT` → `de`):

  ```json
  {
    "promo_phrases": { "de": ["kostenloser versand", "jetzt kaufen", "bester preis"] },
    "boilerplate":   { "de": ["erhältlich bei", "von der marke"] }
  }
  ```

  A malformed file is ignored (never breaks the audit). Don't edit `PROMO_PHRASE_LEXICONS` in the shipped source for one client — use this file.
- ALL CAPS for emphasis is a finding (language-agnostic).
- If brand exists in feed data, the title should normally include it.
- If `product_type` has a useful leaf, the title should include the natural product-type term.
- Variant titles should be unique when variant facts exist, especially color, size, material, gender, quantity, model, or compatibility.
- Avoid keyword stuffing. Natural, factual language beats repeated synonyms.

## Description templates

| Catalog type | Description substance |
|---|---|
| Fashion / apparel | Brand/product, target wearer, material, fit, color, size, and comfort/style benefits. |
| Electronics | Brand/model, key specs, use case, compatibility, included components, and finish/color. |
| Consumables / health & beauty | Brand/product, active amount or size, target audience, format, quality cues, and usage facts. |
| Home & furniture | Room/use, brand/product, dimensions, material, color, style, features, and assembly facts. |
| Books & media | Title, author/creator, format, topic/genre, edition/version, length, and ISBN when available. |
| Seasonal / occasion | Occasion, product type, size/capacity, colors, features, and indoor/outdoor use. |
| Sports & outdoors | Brand/product, activity/use case, specs, material, capacity/dimensions, and durability features. |
| Automotive | Compatibility when relevant, then product type, brand, material/specs, quantity, and fitment facts. |
| General fallback | Brand/product type, key attributes, use case, differentiator, and concrete specs already present in feed data. |

## Description checks

- Front-load product substance in the first 160 characters.
- Blank (high) and <80 characters (medium) are findings. The script no longer flags the <250 band — short-but-substantive descriptions are fine; judge substance qualitatively.
- Remove promotional wording (language-scoped, see Title checks), HTML-like markup, URLs, empty placeholders, and store boilerplate. A plain price mention is allowed and is no longer flagged as promotional.
- Be specific: concrete features, specs, dimensions, materials, compatibility, quantities, use cases, and benefits.
- Do not describe accessories, bundles, or claims that are not supported by feed/source facts.

## Top performer slice

Always consult `top_performer_slice` in `title-desc-clusters.json` when available. Ranking uses the primary metric detected from `business.md`, then conversions, then conversion value. If the primary metric cannot be mapped to product-level data, the artifact falls back to conversions and conversion value and says so.

Use the top-50 overlap to prioritize cluster sequencing. Do not invent CPA, ROAS, POAS, or conversion targets.

## Fixability

- Always `content-maker` (free-text generation/rewrite). Never a deterministic `/feed-optimizer` transform.
- Route the handoff to `/feed-optimizer content`.
- Missing source facts are not title/description rewrite work. List the unknown facts and keep them out of generated copy.

## Confidence

- High when promotional, ALL CAPS, blank, HTML/URL, or placeholder issues are present.
- Medium for length and formula-fit nuances.
- Lower confidence when catalog classification is mixed, language is unclear, or key source fields are missing.
