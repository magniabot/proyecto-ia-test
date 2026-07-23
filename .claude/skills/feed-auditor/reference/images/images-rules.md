# Images Rules

Grounded in the Data Spec image requirements. Three layers: metadata (always), Tier-1 live URL probe (default when the `images` module runs), Tier-2 visual sample where Claude looks at the images for composition/policy issues metadata cannot reveal. Also look at if the image makes sense for the product and can it help sell the product or can the user do something better with the image. Give the best advice to improve the image.

## Metadata checks (always; match the script's CSV output)

- `image_link` blank → **high** severity (product cannot serve). Blocking.
- No additional images → **low** severity (coverage opportunity).
- Merchant item issue code contains "image" → flagged image issue (deeper than coverage).

## Tier-1 probe checks (when `scripts/probe-images.js` has run)

Fetched live from each `image_link` and folded into the images queue (`priority_basis = image_probe:<code>`):

- `broken_image_url` / `not_an_image` → **high** (image cannot be crawled / wrong content-type → disapproval).
- `below_minimum_size` → **high**. Hard min 100×100 px; **250×250 px for apparel** (apparel detected from `google_product_category` / `product_type`, or gender+size present).
- `file_too_large` (>16 MB) / `too_many_megapixels` (>64 MP) → **high** (Google rejects).
- `below_recommended_size` (<800×800) → **medium**.
- `below_ideal_size` (<1500×1500) → **low** (Data-Spec ideal).
- `dimensions_unreadable` → **low** (responded but header not parseable).

## Tier-2 visual checks (Claude, runs automatically, on the downloaded top-N sample only)

**Primary image** (`local_path`): promotional text / watermarks (policy violation), non-white or cluttered background, frame fill (product too small/cropped), multiple products in a single-product image, blur/low quality. Advisory only. `priority_basis=tier2_visual_review`.

**Lifestyle image** (`lifestyle.local_path`, when present): rate against the **business case**, not a generic checklist. Discover the target customer / use case / positioning from `business.md` first, then judge — relevance to the actual buyer and use, in-context/aspirational staging, hero-product clarity, complementarity with the white-background primary, and the same policy/quality checks. Short rating + one highest-leverage tip. `priority_basis=tier2_lifestyle_review`.

**Additional images** (`additional[]`, up to 2 when present): judge the **gallery** — do the extra angles/details add buying information (back/side, scale, texture, in-use) or just repeat the hero? Note duplicates; flag policy issues. Short rating + one tip. `priority_basis=tier2_additional_review`.

Only judge images that were actually downloaded for a sampled product; never penalize a missing lifestyle/additional image here (coverage is a separate metadata finding). Write all sampled visual findings back to `images-queue.csv` so the queue remains the complete product-level ledger for the Images module. Use `fixability_class=external`, `recommended_downstream=advisory-brief`, and the matching `priority_basis` above.

## Fixability

- Always `external` (designer / source). No CSV transform can produce or fix an image.

## Confidence

- High on coverage facts, Merchant-flagged issues, and Tier-1 probe facts (status/dimensions/bytes are measured, not inferred).
- Visual claims (primary, lifestyle, additional): only from the Tier-2 sample, and only for images actually downloaded. Never infer visual quality from metadata, and never extend a visual claim to products outside the sample. If the probe did not run, state that dimensions/broken-link/oversize were not checked.
