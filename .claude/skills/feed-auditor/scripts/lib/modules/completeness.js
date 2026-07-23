// Completeness module — vertical-driven presence audit.
//
// Answers: "for THIS account's vertical(s), which expected attributes are PRESENT vs MISSING?"
//
// Flow: detect each product's vertical (GPC top-level resolved via the bundled Google taxonomy,
// product_type top-level fallback, else unclassified) -> derive the expected-attribute set from
// the catalog's per-attribute `completeness` blocks + cross-cutting conditions -> check presence.
// Relevance is resolved per product, so a mixed catalog flags the right attributes per segment;
// an attribute that is not expected for a product is NEVER penalised.
//
// Tiering (from the catalog `completeness.tier`): tier 1 gaps DRIVE the score (a relevant gap is
// a fail); tier 2 gaps are reported as upside only ("nice to have", no score weight). Apparel
// size/gender/colour/age are tier 1 only in required markets (market_gated), tier 2 elsewhere.
//
// Safety default: a product with no positive vertical signal expects only the hard-required base
// fields — it is never flagged for specialty attributes.
//
// Presence-vs-quality split: this module checks PRESENCE only; value quality belongs to the
// attributes module. Error-lane-wins dedup: products Merchant has already flagged are owned by
// the Errors module and excluded here, so a disapproval is not double-counted.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { FIXABILITY, makeQueueRow, scoreFromAffected, normText, routeFor } from './shared.js';
import { parseTaxonomy, resolveGpcPath, classifyVertical } from '../taxonomy.js';
import { readCsv } from '../feed-auditor-core.js';

export const id = 'completeness';
export const label = 'Completeness';
export const weight = 25;

const __dirname = dirname(fileURLToPath(import.meta.url));
// Exported as the single source of truth for the attribute relevance/validity catalog.
// feed-optimizer's LLM-enrichment actions import this (with the engine functions below) at
// runtime rather than copying it — see docs/adr/0001-feed-auditor-optimizer-runtime-coupling.md.
export const CATALOG = JSON.parse(readFileSync(resolve(__dirname, 'attribute-validation-catalog.json'), 'utf8'));
// Re-export so a downstream consumer has one import surface for the relevance engine.
export { classifyVertical } from '../taxonomy.js';
const PRESENCE = CATALOG.presence;
const REQUIRED_MARKETS = new Set(PRESENCE.required_size_markets.map((c) => c.toUpperCase()));
const EU_MARKETS = new Set(PRESENCE.eu_markets.map((c) => c.toUpperCase()));
const USED_VALUES = new Set(PRESENCE.used_condition_values.map((v) => v.toLowerCase()));
const APPAREL_VERTICALS = new Set(PRESENCE.gpc_top_level_groups.apparel);
const UNIT_PRICING_VERTICALS = new Set(PRESENCE.gpc_top_level_groups.unit_pricing);
const DIMENSIONED_VERTICALS = new Set(PRESENCE.gpc_top_level_groups.dimensioned || []);
// Channel types that surface short_title / lifestyle imagery (browse-oriented, image-led inventory:
// Demand Gen, YouTube/Video, and Performance Max — PMax serves the same Demand Gen / Discover feeds).
const DEMAND_GEN_CHANNEL_TYPES = new Set(['DEMAND_GEN', 'VIDEO', 'PERFORMANCE_MAX']);
// Only optimizer-actionable findings are enumerated per-product (the optimizer consumes them per
// SKU). Tier-2 upside in the advisory classes (content-maker / source-required / external) has no
// per-product consumer — it is reported as a coverage-level summary, not thousands of identical
// rows. See reference/completeness/completeness-flow.md.
const OPTIMIZER_ACTIONABLE = new Set([FIXABILITY.OPTIMIZER_DERIVABLE, FIXABILITY.OPTIMIZER_STRATEGY]);
const CATALOG_PRESENCE_ATTRS = Object.entries(CATALOG.attributes).filter(([, def]) => def.completeness);

// Taxonomy is read once, offline, from the bundled cache (pull-data refreshes it). null when the
// cache is unavailable — classification then degrades to product_type only (lower confidence).
let TAXONOMY = null;
try { TAXONOMY = parseTaxonomy(); } catch { TAXONOMY = null; }

// Keyword fallback when the vertical can't be resolved from the taxonomy (foreign-language
// product_type, blank GPC). Used only to corroborate apparel, never to invent a vertical.
const APPAREL_RE = /apparel|clothing|shoe|footwear|kleding|schoen|accessor|jewel|sieraad|sieraden|bags?|tas(?:sen)?|watch|horloge|lingerie|sock|sok/;

const COLOR_WORDS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown',
  'grey', 'gray', 'beige', 'gold', 'silver', 'navy', 'multi',
  'zwart', 'wit', 'rood', 'blauw', 'groen', 'geel', 'roze', 'paars', 'oranje', 'bruin',
  'grijs', 'goud', 'zilver',
];
const MATERIAL_WORDS = [
  'cotton', 'leather', 'wool', 'polyester', 'silk', 'denim', 'linen', 'nylon', 'rubber',
  'wood', 'metal', 'steel', 'aluminium', 'aluminum', 'glass', 'ceramic', 'plastic',
  'katoen', 'leer', 'leder', 'wol', 'zijde', 'linnen', 'hout', 'metaal', 'staal', 'glas',
  'keramiek', 'kunststof',
];
const GENDER_WORDS = ['men', 'mens', 'women', 'womens', 'male', 'female', 'unisex', 'heren', 'dames', 'kids', 'jongens', 'meisjes'];
const AGE_WORDS = ['baby', 'newborn', 'infant', 'toddler', 'kids', 'kind', 'kinderen', 'adult', 'volwassen', 'peuter', 'kleuter'];
const PATTERN_WORDS = ['striped', 'floral', 'solid', 'plaid', 'checked', 'polka', 'gestreept', 'gebloemd', 'effen', 'geruit'];
const SIZE_RE = /\b(xxs|xs|s|m|l|xl|xxl|xxxl|\d{2,3}\s?(cm|mm|ml|cl|l|kg|g))\b|\bsize\s|\bmaat\s/i;
// Unit pricing is only meaningful for goods actually sold by a measurable quantity. A numeric
// quantity + unit (or a multipack/per-unit cue) in the title/description is the signal — without
// it, a unit-pricing-category product (e.g. a stapler) should NOT be flagged.
const UNIT_MEASURE_RE = /\b\d+([.,]\d+)?\s?(ml|cl|l|mg|g|kg|oz|lb|floz|pt|qt|gal|m|cm|mm|ct|sheets?|vel(?:len)?|stuks?|rollen?|pack|st)\b/i;

function hasWord(text, words) {
  const t = normText(text);
  return words.some((word) => new RegExp(`\\b${word}\\b`).test(t));
}

function isPresent(value) {
  return Boolean(value && String(value).trim());
}

function gpcPathOf(product) {
  // Prefer the English path normalized at pull time (works for any feed language); fall back to a
  // live resolve of the raw value for caches written before GPC normalization existed.
  return String(product.gpc_path_en || '').trim() || resolveGpcPath(TAXONOMY, product.google_product_category);
}

function isApparelProduct(product) {
  const { vertical, source } = classifyVertical(product, TAXONOMY);
  if (APPAREL_VERTICALS.has(vertical)) return true;
  // GPC is authoritative when it resolves: a definitive non-apparel vertical (e.g. Office Supplies
  // for a "draagtas"/carrier bag) must not be overridden by a keyword match in product_type. The
  // regex is only a corroboration fallback for products whose vertical can't be resolved from the
  // taxonomy (blank/foreign-language GPC) — never to invent a vertical over a resolved one.
  if (source === 'gpc') return false;
  return APPAREL_RE.test(normText(`${gpcPathOf(product)} ${product.product_type}`));
}

// A product carrying any variant-defining attribute is treated as a variant.
function isVariantProduct(product) {
  return isPresent(product.color) || isPresent(product.size) || isPresent(product.pattern) || isPresent(product.item_group_id);
}

function isUnitPricingProduct(product) {
  const { vertical } = classifyVertical(product, TAXONOMY);
  if (!UNIT_PRICING_VERTICALS.has(vertical)) return false;
  // Narrow to products that are actually sold by a measurable quantity (avoids flagging every
  // SKU in a unit-pricing vertical). Existing unit_pricing fields also count as a positive signal.
  return UNIT_MEASURE_RE.test(`${product.title} ${product.description}`) || isPresent(product.unit_pricing_base_measure);
}

// Product dimensions/weight matter for verticals where physical size drives shipping/fit
// (furniture, home & garden, large hardware, etc.). Gated by the product's detected vertical.
function isDimensionedProduct(product) {
  const { vertical } = classifyVertical(product, TAXONOMY);
  return DIMENSIONED_VERTICALS.has(vertical);
}

// Account-level signal: does the account run a Demand Gen or YouTube/Video campaign? short_title
// and lifestyle_image_link only earn their keep on those browse/image-led surfaces, so they are
// expected only when such a campaign exists. Read once from the google-ads context (already pulled
// by /gads-context); absent file -> false (never flag on missing data).
export function detectDemandGenOrVideo(projectRoot) {
  if (!projectRoot) return false;
  const path = resolve(projectRoot, 'context/google-ads/data/campaigns.csv');
  if (!existsSync(path)) return false;
  let rows;
  try { rows = readCsv(path); } catch { return false; }
  return rows.some((row) => DEMAND_GEN_CHANNEL_TYPES.has(String(row['campaign.advertising_channel_type'] || '').trim().toUpperCase()));
}

function isEnergyRegulatedProduct(product) {
  const path = gpcPathOf(product);
  if (!path) return false;
  return PRESENCE.energy_regulated_path_keywords.some((kw) => path.toLowerCase().includes(kw.toLowerCase()));
}

// Market gating uses the product's own target_country, falling back to the account-level set.
function productMarkets(product, profile) {
  const own = String(product.target_country || '').toUpperCase();
  const markets = own ? [own] : profile.target_countries;
  return markets;
}
function inRequiredMarket(product, profile) {
  return productMarkets(product, profile).some((c) => REQUIRED_MARKETS.has(c));
}
function inEuMarket(product, profile) {
  return productMarkets(product, profile).some((c) => EU_MARKETS.has(c));
}

// Resolve whether an attribute is expected for a product, and at which tier. Returns
// { relevant, tier, reason }. Market-gated apparel attributes drop to tier 2 outside required
// markets (and when the product is not actually apparel).
export function relevanceFor(comp, product, profile) {
  let relevant = false;
  let reason = comp.relevance;
  switch (comp.relevance) {
    case 'always': relevant = true; break;
    case 'apparel': relevant = isApparelProduct(product); break;
    case 'apparel_or_variant': relevant = isApparelProduct(product) || isVariantProduct(product); break;
    case 'variant_signal': relevant = isVariantProduct(product); break;
    case 'used_catalog': relevant = profile.used_or_refurbished_share_pct > 0; break;
    case 'branded': relevant = profile.branded_share_pct >= PRESENCE.branded_share_threshold_pct; break;
    case 'branded_no_gtin': relevant = profile.branded_share_pct >= PRESENCE.branded_share_threshold_pct && !isPresent(product.gtin); break;
    case 'unit_pricing_category': relevant = isUnitPricingProduct(product); break;
    case 'dimensioned_category': relevant = isDimensionedProduct(product); break;
    case 'demand_gen_surface': relevant = Boolean(profile.demand_gen_or_video_present); break;
    case 'energy_eu': relevant = isEnergyRegulatedProduct(product) && inEuMarket(product, profile); break;
    default: relevant = false;
  }
  if (!relevant) return { relevant: false };

  let tier = comp.tier;
  if (comp.market_gated && tier === 1) {
    // Apparel gender/age/colour/size are a hard requirement only for apparel in required markets.
    if (!(isApparelProduct(product) && inRequiredMarket(product, profile))) {
      tier = 2;
      reason = `${comp.relevance} (tier-2: not apparel-in-required-market)`;
    }
  }
  return { relevant: true, tier, reason };
}

// Provisional fixability: can the missing value be derived from text already in the feed, or does
// it need a source/external action? Claude finalises per reference/fixability-classes.md.
export function deriveFixability(attribute, product) {
  const haystack = `${product.title} ${product.description}`;
  switch (attribute) {
    case 'color':
      return hasWord(haystack, COLOR_WORDS)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'color' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'material':
      return hasWord(haystack, MATERIAL_WORDS)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'material' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'gender':
      return hasWord(haystack, GENDER_WORDS)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'gender' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'age_group':
      return hasWord(haystack, AGE_WORDS)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'age-group' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'pattern':
      return hasWord(haystack, PATTERN_WORDS)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'pattern' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'size':
      return SIZE_RE.test(`${product.title}`)
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'size' }
        : { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform' };
    case 'condition':
      // Condition defaults to "new"; the optimizer can stamp it from a derivable signal.
      return { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'condition' };
    case 'product_type':
      return product.google_product_category
        ? { fixability: FIXABILITY.OPTIMIZER_DERIVABLE, optimizer_action: 'product-type' }
        : { fixability: FIXABILITY.OPTIMIZER_STRATEGY, optimizer_action: 'product-type' };
    case 'google_product_category':
      return { fixability: FIXABILITY.OPTIMIZER_STRATEGY, optimizer_action: 'taxonomy' };
    case 'unit_pricing_measure':
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (measures)' };
    case 'energy_efficiency_class':
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / manufacturer (EU energy data)' };
    case 'certification':
      return { fixability: FIXABILITY.EXTERNAL, actor: 'Certification authority (EPREL/EU)' };
    case 'product_length':
    case 'product_width':
    case 'product_height':
    case 'product_weight':
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (product dimensions)' };
    case 'cost_of_goods_sold':
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (margin data)' };
    case 'product_highlight':
    case 'product_detail':
    case 'short_title':
      // Free-text enrichment — generated, not derived from a single field.
      return { fixability: FIXABILITY.CONTENT_MAKER, actor: null };
    case 'lifestyle_image_link':
      return { fixability: FIXABILITY.EXTERNAL, actor: 'Designer / source (lifestyle imagery)' };
    case 'item_group_id':
    case 'gtin':
    case 'brand':
    case 'mpn':
    default:
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (identifiers)' };
  }
}

// Hard-required base fields are presence-only here (their validity / disapproval handling lives in
// errors / title-desc / images). A missing base field is the most severe completeness gap.
function hardRequiredFixability(field) {
  switch (field) {
    case 'title':
    case 'description':
      return { fixability: FIXABILITY.CONTENT_MAKER, actor: null };
    case 'image_link':
      return { fixability: FIXABILITY.EXTERNAL, actor: 'Designer / source (imagery)' };
    case 'link':
      return { fixability: FIXABILITY.EXTERNAL, actor: 'Website / developer' };
    case 'price':
    case 'availability':
      return { fixability: FIXABILITY.EXTERNAL, actor: 'Website / source feed (price & availability)' };
    case 'product_id':
    default:
      return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (identifiers)' };
  }
}

export function buildBusinessProfile(products) {
  const total = products.length || 1;
  const verticalCounts = new Map();
  const sourceCounts = { gpc: 0, product_type: 0, unclassified: 0 };
  const countrySet = new Set();
  let apparel = 0; let branded = 0; let variant = 0; let usedRefurb = 0;

  for (const product of products) {
    const { vertical, source } = classifyVertical(product, TAXONOMY);
    const key = vertical || '(unclassified)';
    verticalCounts.set(key, (verticalCounts.get(key) || 0) + 1);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    if (isApparelProduct(product)) apparel += 1;
    if (isPresent(product.brand)) branded += 1;
    if (isVariantProduct(product)) variant += 1;
    if (USED_VALUES.has(normText(product.condition))) usedRefurb += 1;
    if (product.target_country) countrySet.add(String(product.target_country).toUpperCase());
  }

  // Measure GPC informativeness on the canonical id when available (collapses the same category
  // expressed in different raw/localized forms), falling back to the raw value for old caches.
  const distinctGpc = new Set(products.map((p) => String(p.gpc_id || p.google_product_category || '').trim()).filter(Boolean));
  const gpc_informative = distinctGpc.size > 1;
  const taxonomy_available = Boolean(TAXONOMY);
  const gpcShare = sourceCounts.gpc / total;
  const unclassifiedShare = sourceCounts.unclassified / total;

  let classification_confidence = 'high';
  if (!taxonomy_available) classification_confidence = 'low';
  else if (unclassifiedShare > 0.3) classification_confidence = 'low';
  else if (gpcShare < 0.7 || !gpc_informative) classification_confidence = 'medium';

  let classification_source = 'unclassified';
  if (gpcShare >= 0.7) classification_source = gpc_informative ? 'gpc' : 'gpc-uniform';
  else if (sourceCounts.product_type > 0) classification_source = 'product_type';

  const vertical_distribution = [...verticalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([vertical, count]) => ({ vertical, count, pct: Math.round((count / total) * 100) }));

  const target_countries = [...countrySet];

  return {
    product_count: products.length,
    vertical_distribution,
    classification_source,
    classification_confidence,
    gpc_informative,
    taxonomy_available,
    distinct_gpc_values: distinctGpc.size,
    apparel_share_pct: Math.round((apparel / total) * 100),
    branded_share_pct: Math.round((branded / total) * 100),
    variant_share_pct: Math.round((variant / total) * 100),
    used_or_refurbished_share_pct: Math.round((usedRefurb / total) * 100),
    target_countries,
    eu_market: target_countries.some((c) => EU_MARKETS.has(c)),
    required_size_market: target_countries.some((c) => REQUIRED_MARKETS.has(c)),
    looks_like_apparel: apparel / total >= 0.4,
  };
}

export function build({ audit, products, projectRoot }) {
  const profile = buildBusinessProfile(products);
  // Account-level surface signal (gates short_title / lifestyle_image_link relevance).
  profile.demand_gen_or_video_present = detectDemandGenOrVideo(projectRoot);
  // Error-lane-wins: products Merchant already flagged are owned by the Errors module.
  const errorFlagged = new Set((audit.evidence.itemEligibilityIssues || []).map((row) => row.product_id));

  const queueRows = [];
  const briefBuckets = new Map();
  const scoreAffected = new Set();
  // attribute -> { tier, eligible, present }
  const coverageMap = new Map();
  // Tier-2 upside, coverage-level (not enumerated per product): attribute -> { missing, fixability, actor, reason }
  const upsideMap = new Map();

  const bumpCoverage = (attribute, tier, present) => {
    const entry = coverageMap.get(attribute) || { attribute, tier, eligible: 0, present: 0 };
    entry.eligible += 1;
    if (present) entry.present += 1;
    // Record the strictest (lowest-number) tier seen so the report reflects score impact.
    entry.tier = Math.min(entry.tier, tier);
    coverageMap.set(attribute, entry);
  };

  const addFinding = (product, { attribute, tier, fixability, optimizer_action, actor, reason }) => {
    // Tier-2 upside in a non-optimizer:* class has no per-product queue consumer (the content
    // action builds its own worklist from the full cache; source-required/external are advisory).
    // Summarise it at the attribute level instead of emitting one identical queue row per
    // product — the coverage stat already carries the count.
    if (tier !== 1 && !OPTIMIZER_ACTIONABLE.has(fixability)) {
      const entry = upsideMap.get(attribute) || { attribute, missing: 0, fixability, actor: actor || null, reason };
      entry.missing += 1;
      upsideMap.set(attribute, entry);
      return;
    }
    const queueRow = makeQueueRow(product, id, {
      finding: `expected attribute "${attribute}" is missing`,
      attribute,
      fixability_class: fixability,
      optimizer_action,
      confidence: tier === 1 ? 'high' : 'medium',
      tier,
      severity: tier === 1 ? 'important' : 'recommended',
      priority_basis: `tier=${tier}; relevance=${reason}`,
    });
    queueRows.push(queueRow);
    if (tier === 1) scoreAffected.add(product.product_id);
    if (actor) {
      if (!briefBuckets.has(actor)) briefBuckets.set(actor, []);
      briefBuckets.get(actor).push({ product_id: product.product_id, title: product.title, finding: queueRow.finding });
    }
  };

  for (const product of products) {
    const flagged = errorFlagged.has(product.product_id);

    // 1. Hard-required base fields (always expected, tier 1). Proactive presence check —
    //    Errors only mirrors what Merchant flagged; this catches the not-yet-flagged gaps.
    for (const hard of PRESENCE.hard_required) {
      const present = isPresent(product[hard.field]);
      bumpCoverage(hard.feed_name, 1, present);
      if (present || flagged) continue;
      const { fixability, actor } = hardRequiredFixability(hard.field);
      addFinding(product, {
        attribute: hard.feed_name, tier: 1, fixability, actor, reason: 'hard_required',
      });
    }

    // 2. Vertical/condition-driven attributes from the catalog completeness blocks.
    for (const [attrKey, def] of CATALOG_PRESENCE_ATTRS) {
      const { relevant, tier, reason } = relevanceFor(def.completeness, product, profile);
      if (!relevant) continue;
      const present = isPresent(product[attrKey]);
      bumpCoverage(def.feed_name, tier, present);
      if (present || flagged) continue;
      const { fixability, optimizer_action, actor } = deriveFixability(attrKey, product);
      addFinding(product, { attribute: def.feed_name, tier, fixability, optimizer_action, actor, reason });
    }
  }

  const coverage = [...coverageMap.values()].map((entry) => ({
    attribute: entry.attribute,
    tier: entry.tier,
    eligible: entry.eligible,
    missing: entry.eligible - entry.present,
    coverage_pct: entry.eligible ? Math.round((entry.present / entry.eligible) * 100) : 100,
  }));

  const eligible = products.length;

  // Tier-2 upside summary (coverage-level, one entry per attribute — never per product).
  const upside_summary = [...upsideMap.values()]
    .map((entry) => ({
      attribute: entry.attribute,
      missing: entry.missing,
      fixability_class: entry.fixability,
      recommended_downstream: routeFor(entry.fixability),
      relevance: entry.reason,
    }))
    .sort((a, b) => b.missing - a.missing);

  // Each source-required/external upside attribute contributes ONE summary line to its actor's
  // advisory section (not one row per product), so the brief stays human-readable at scale.
  for (const entry of upsideMap.values()) {
    if (!entry.actor) continue; // content-maker has no advisory actor
    if (!briefBuckets.has(entry.actor)) briefBuckets.set(entry.actor, []);
    briefBuckets.get(entry.actor).push({
      product_id: '(all eligible)',
      title: '',
      finding: `expected attribute "${entry.attribute}" missing on ${entry.missing} product(s) — Tier-2 upside`,
    });
  }

  const briefSections = [...briefBuckets.entries()].map(([actor, rows]) => ({ actor, rows }));
  const topVertical = profile.vertical_distribution[0];

  const upsideNote = upside_summary.length
    ? ` ${upside_summary.length} Tier-2 upside attribute(s) reported at coverage level (see attribute_coverage / upside_summary), not enumerated per product.`
    : '';

  return {
    id,
    label,
    weight,
    applicable: eligible > 0,
    eligible,
    affected: scoreAffected.size,
    score: scoreFromAffected(scoreAffected, eligible),
    findings: queueRows.length,
    findings_by_tier: {
      tier1: queueRows.filter((row) => Number(row.tier) === 1).length,
      tier2_enumerated: queueRows.filter((row) => Number(row.tier) !== 1).length,
      tier2_upside_summarized: upside_summary.reduce((sum, entry) => sum + entry.missing, 0),
    },
    queueRows,
    briefSections,
    business_profile: profile,
    attribute_coverage: coverage,
    upside_summary,
    notes: `Vertical: ${topVertical ? `${topVertical.vertical} (${topVertical.pct}%)` : 'unclassified'} across ${profile.vertical_distribution.length} segment(s); classification ${profile.classification_confidence} via ${profile.classification_source}. Tier-1 gaps drive the score; tier-2 gaps are reported as upside.${upsideNote} Confirm the expected-attribute set with business.md + the user.`,
  };
}
