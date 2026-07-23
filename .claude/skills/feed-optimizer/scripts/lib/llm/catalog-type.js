// Catalog-type resolution for the content action: maps each product to one of the auditor's
// category formulas (TITLE_FORMULAS / DESCRIPTION_TEMPLATES). Account-agnostic: the primary signal
// is the language-independent GPC top-level vertical (gpc_path_en), with the auditor's runtime
// language-pattern detector as a secondary signal, and 'general' (the Universal formula) as the
// fallback for any vertical not in the map. Claude confirms/overrides the detected mix in discovery.

import {
  TITLE_FORMULAS, DESCRIPTION_TEMPLATES, detectCatalogType, readRuntimeLanguagePatterns,
} from '../../../../feed-auditor/scripts/lib/modules/title-desc.js';

export { TITLE_FORMULAS, DESCRIPTION_TEMPLATES, readRuntimeLanguagePatterns };

// Brand-LAST title formulas — feed-optimizer-local override of the auditor's TITLE_FORMULAS. Same
// fact set, but the brand is placed at the END of the title instead of leading it, and the segments
// are delimited with ' | ' so the output title reads `Product type | Key attribute | ... | Brand`.
// This keeps the formula and the user's brand-last + separator preference in agreement (otherwise the
// injected `Formula: Brand + ...` fights any brand-last steering). Books/media keeps the same slots.
export const TITLE_FORMULAS_BRAND_LAST = {
  fashion_apparel: 'Gender | Product type | Attributes (color/size/material) | Brand',
  electronics: 'Attributes | Product type | Model | Brand',
  consumables_health_beauty: 'Product type | Attributes (weight/amount/flavor) | Brand',
  home_furniture: 'Product type | Attributes (size/material/color) | Style | Brand',
  books_media: 'Title | Author | Format | ISBN',
  seasonal_occasion: 'Occasion | Product type | Attributes | Brand',
  sports_outdoors: 'Product type | Attributes (size/weight/material) | Use case | Brand',
  automotive: 'Year/Make/Model compatibility | Product type | Attributes | Brand',
  general: 'Product type | Key attribute | Differentiator | Brand',
};

function titleFormulaFor(catalogType) {
  return TITLE_FORMULAS_BRAND_LAST[catalogType] || TITLE_FORMULAS_BRAND_LAST.general;
}

// The catalog_type keys a user override may target (worklist --type-override).
export const VALID_CATALOG_TYPES = Object.keys(TITLE_FORMULAS_BRAND_LAST);

// GPC top-level vertical (first segment of gpc_path_en) -> catalog_type key. Keys match the auditor's
// TITLE_FORMULAS / DESCRIPTION_TEMPLATES. Anything unmapped -> 'general' (Universal formula).
const GPC_TOP_LEVEL_TO_TYPE = {
  'apparel & accessories': 'fashion_apparel',
  'electronics': 'electronics',
  'cameras & optics': 'electronics',
  'health & beauty': 'consumables_health_beauty',
  'food, beverages & tobacco': 'consumables_health_beauty',
  'furniture': 'home_furniture',
  'home & garden': 'home_furniture',
  'media': 'books_media',
  'sporting goods': 'sports_outdoors',
  'vehicles & parts': 'automotive',
};

// Seasonal/occasion is a cross-vertical signal (the GPC vertical is often Home & Garden / Toys), so
// detect it from obvious occasion cues in the path/type rather than a top-level vertical.
const SEASONAL_RE = /christmas|halloween|easter|valentine|seasonal|holiday|occasion|kerst|pasen/i;

export function topLevelVertical(gpcPathEn) {
  const path = String(gpcPathEn || '').trim();
  if (!path) return '';
  return path.split('>')[0].trim().toLowerCase();
}

// Resolve the catalog_type for one product. Returns { catalog_type, source, confidence }.
// `runtimePatterns` is optional (from readRuntimeLanguagePatterns) — when present it can refine an
// otherwise-'general' GPC result using the client's runtime language lexicon. `typeOverrides` is an
// optional user-confirmed map of GPC top-level vertical -> catalog_type (from worklist
// --type-override); an explicit override beats every heuristic, including the occasion cue.
export function catalogTypeForProduct(product, runtimePatterns = null, typeOverrides = null) {
  if (typeOverrides) {
    const overridden = typeOverrides[topLevelVertical(product.gpc_path_en)];
    if (overridden) return { catalog_type: overridden, source: 'user-override', confidence: 'high' };
  }
  const hay = `${product.gpc_path_en || ''} ${product.product_type || ''}`;
  if (SEASONAL_RE.test(hay)) return { catalog_type: 'seasonal_occasion', source: 'occasion-cue', confidence: 'medium' };

  const top = topLevelVertical(product.gpc_path_en);
  const mapped = GPC_TOP_LEVEL_TO_TYPE[top];
  if (mapped) return { catalog_type: mapped, source: 'gpc-top-level', confidence: 'high' };

  // No GPC mapping — try the auditor's runtime language-pattern detector before giving up.
  if (runtimePatterns && runtimePatterns.pattern_count > 0) {
    const det = detectCatalogType(product, runtimePatterns);
    if (det.catalog_type && det.catalog_type !== 'general') {
      return { catalog_type: det.catalog_type, source: det.source, confidence: det.confidence };
    }
  }
  return { catalog_type: 'general', source: 'fallback', confidence: 'low' };
}

export function formulasFor(catalogType) {
  return {
    title_formula: titleFormulaFor(catalogType),
    description_guidance: DESCRIPTION_TEMPLATES[catalogType] || DESCRIPTION_TEMPLATES.general,
  };
}

// Catalog-type distribution across the product set (for the discovery confirmation step).
export function catalogTypeDistribution(products, runtimePatterns = null, typeOverrides = null) {
  const counts = new Map();
  for (const p of products) {
    const { catalog_type } = catalogTypeForProduct(p, runtimePatterns, typeOverrides);
    counts.set(catalog_type, (counts.get(catalog_type) || 0) + 1);
  }
  const total = products.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([catalog_type, count]) => ({
      catalog_type, count, pct: Math.round((count / total) * 100),
      title_formula: titleFormulaFor(catalog_type),
    }));
}
