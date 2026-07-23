# Images Flow

Three layers, increasing depth. Findings are always `external` (designer/source) → advisory brief, never a skill handoff. Read `images-rules.md`.

1. **Metadata (always):** missing `image_link`, additional-image coverage, Merchant-flagged image issue codes. Available with no extra step.
2. **Tier-1 probe (default when the `images` module runs):** live ranged fetch of each `image_link` → real dimensions, broken/uncrawlable links, oversize. Produced by `scripts/probe-images.js`; folded into the images queue + score automatically when present.
3. **Tier-2 visual:** the top-N products by the business target are downloaded; Claude *looks* at them for composition/policy issues metadata cannot reveal. For each top-N product the probe also downloads the `lifestyle_image_link` (when present) and up to 2 `additional_image_link`s (1 if only one exists), so Claude can rate the whole gallery — lifestyle and extra angles — on how well it sells the product for **this** business case, not just whether the images exist.

## Inputs

- `module-scores.json` → `modules[images]` (score, band, eligible, affected).
- `context/analysis/feed/images-queue.csv` — per-product image findings (metadata + Tier-1 probe).
- `context/analysis/feed/images-advisory-brief.md` — designer/source actions (when present).
- `context/feed/cache/image-probe.json` — Tier-1 probe results (when the probe ran).
- `context/feed/cache/image-visual-queue.json` + `context/feed/cache/images/*` — Tier-2 sample for the visual pass (when the probe ran). Each item carries `local_path` (primary image), an optional `lifestyle` object with its own `local_path` (`<product_id>-lifestyle.<ext>`), and an `additional[]` array (up to 2 items, `<product_id>-additional-N.<ext>`) each with `local_path`.

## Procedure

1. **Always run the probe before analysis** (Tier-1 + Tier-2 in one call) whenever `images`, `full`, or a partial run including `images` runs — Claude runs this automatically, without asking the user:
   ```bash
   node .claude/skills/feed-auditor/scripts/probe-images.js --visual [--top 15] [--limit N]
   ```
   A single `--visual` invocation runs Tier-1 over the whole feed **and** downloads the top-N for Tier-2. For very large feeds, `--limit N` may cap Tier 1; state that coverage is incomplete. Ranking uses the business target discovered from `business.md`/settings: ROAS -> conversion value; CPA -> conversions; no-conversion fallback -> cost, then impressions. Never use hardcoded targets. For each top-N product the script downloads the primary image, the `lifestyle_image_link` (when present), and up to 2 `additional_image_link`s (1 if only one exists).
2. **Score & band.** Eligible denominator = all products.
3. **Separate** the layers: missing-primary-image (blocking) vs additional-image coverage (low) vs Merchant-flagged issues vs Tier-1 probe facts (broken/undersized/oversize, severity per finding).
4. **Visual pass.** If `image-visual-queue.json` exists, Read each `local_path` (primary image) and assess: promotional text/watermarks (policy violation), background, frame fill, single-product correctness, blur. Append sampled visual findings to `images-queue.csv` (`fixability_class=external`, `recommended_downstream=advisory-brief`, `priority_basis=tier2_visual_review`) and fold them into the advisory brief. Only assert visual quality for the sampled products.
5. **Lifestyle pass (when present).** For each item that also has a `lifestyle.local_path`, Read that image too and rate it **against the business case**, not as a generic checklist. Discover the target customer, use case, and positioning from `business.md` first, then judge:
   - **Relevance** — does the scene match the actual buyer and how/where the product is used? (A studio prop unrelated to the use case scores low even if it's pretty.)
   - **Context / aspiration** — does it show the product in use or in an environment that makes the value obvious and desirable for that audience?
   - **Hero clarity** — is the selling product unmistakably the focus (not lost among props or other items)?
   - **Complementarity** — does it add information the primary white-background shot can't (scale, fit, texture, lifestyle), rather than duplicating it?
   - **Policy/quality** — same watermark/promotional-text/blur checks as the primary (lifestyle images must still meet Merchant policy).
   Give a short rating + the single highest-leverage tip ("shoot in-kitchen to show scale", "remove the second product", etc.). Append as a row with `priority_basis=tier2_lifestyle_review` (still `fixability_class=external`, `recommended_downstream=advisory-brief`) and fold into the advisory brief under the designer actor. Only assert this for products in the sample that actually have a lifestyle image.
6. **Additional-images pass (when present).** For each item with an `additional[]` array, Read those images (up to 2) and judge the **gallery**, not each shot in isolation: do the extra angles/details add buying information the primary can't — back/side views, scale, texture, materials, in-use/detail close-ups — or do they just repeat the hero? Note duplicates, and flag any policy issues (watermark/promotional text/blur) the same way as the primary. Give a short rating + the highest-leverage tip ("add a back view", "the 2nd shot duplicates the hero — swap for a scale/in-use angle"). Append as a row with `priority_basis=tier2_additional_review` (still `fixability_class=external`, `recommended_downstream=advisory-brief`) and fold into the advisory brief under the designer actor. Only assert this for sampled products that actually have additional images.
7. **Handoff.** Point to `images-advisory-brief.md`, grouped by actor (designer / source).

## Boundaries

- Metadata layer asserts only coverage facts. Tier-1 probe asserts only measurable URL facts (status, dimensions, byte size).
- **Visual composition, background, frame fill, watermarks, product correctness** are asserted ONLY from the Tier-2 sampled images (primary, lifestyle, and additional) — never inferred from metadata, and never extrapolated to products outside the sample.
- **Lifestyle and additional-image quality** are rated only when those images were actually downloaded for a sampled product. A product with no `lifestyle_image_link` is not penalized in the visual pass (coverage is a separate metadata finding); judge only what is present.
- If the probe did not run, say so: image findings are metadata-only and dimension/broken-link/oversize were not checked.
