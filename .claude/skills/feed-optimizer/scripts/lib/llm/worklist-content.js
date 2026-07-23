// Worklist builder for the content action.
//
// Universe = the FULL normalized product cache (same as small-attributes). For each product we take
// the UNION of two triggers, processed in ONE call:
//   - rewrite: title / description whose EXISTING value trips the auditor's weakness detectors
//     (titleIssues / descriptionIssues — imported, single source of truth). Never rewrites copy that
//     already passes.
//   - backfill: short_title / product_highlight / product_detail that are MISSING and relevant per
//     the auditor completeness engine. short_title rides the demand_gen_surface gate (driven by
//     campaigns.csv via detectDemandGenOrVideo); product_highlight / product_detail are 'always'.
//
// Relevance + weakness come from the imported feed-auditor engine; nothing is recomputed locally.

import {
  CATALOG, buildBusinessProfile, relevanceFor, deriveFixability, detectDemandGenOrVideo,
} from '../../../../feed-auditor/scripts/lib/modules/completeness.js';
import { titleIssues, descriptionIssues, loadLexiconOverrides } from '../../../../feed-auditor/scripts/lib/feed-auditor-core.js';
import { SOURCE_FIELDS } from '../../../../feed-auditor/scripts/lib/modules/title-desc.js';
import { OWNED, SUPPRESSED_TITLE_REASONS } from './spec-content.js';
import { catalogTypeForProduct, formulasFor, readRuntimeLanguagePatterns } from './catalog-type.js';

const ATTR = CATALOG.attributes;

function isPresent(value) {
  return Boolean(value && String(value).trim());
}

// The SOURCE_FIELDS the model may recombine into prose — only the populated ones, to keep the prompt
// (and tokens) lean and to make "what evidence existed" auditable in the diff.
function evidenceFields(product) {
  const out = {};
  for (const f of SOURCE_FIELDS) if (isPresent(product[f])) out[f] = String(product[f]).trim();
  return out;
}

function buildProfile(products, projectRoot) {
  const profile = buildBusinessProfile(products);
  // buildBusinessProfile() does not set the surface flag (the auditor module sets it in build());
  // wire it here so the demand_gen_surface relevance gate works for short_title.
  profile.demand_gen_or_video_present = detectDemandGenOrVideo(projectRoot);
  return profile;
}

// Owned attributes that apply to one product, with their trigger metadata.
function attrsForProduct(product, profile, toggles, overrides) {
  const attrs = [];
  for (const spec of OWNED) {
    if (toggles && toggles[spec.key] === false) continue;

    if (spec.trigger === 'weakness') {
      // Rewrite path: only when the EXISTING value is weak. Blank title/description counts (the
      // detectors flag "blank"/"very short"), so genuinely-empty prose is rewritten too.
      const allReasons = spec.key === 'title'
        ? titleIssues(product, overrides)
        : descriptionIssues(product, overrides);
      if (allReasons.length === 0) continue;
      // Keep the title in scope on the FULL reason set (so a product_type-leaf-only weakness still
      // gets the brand-last/separator reformat), but hide suppressed reasons from the model so it
      // never tries to keyword-stuff a generic product_type leaf into the title.
      const reasons = spec.key === 'title'
        ? allReasons.filter((r) => !SUPPRESSED_TITLE_REASONS.has(r))
        : allReasons;
      attrs.push({
        attr: spec.key, feed_name: spec.feed_name, mode: spec.mode, latitude: spec.latitude,
        trigger: 'weakness', reasons,
      });
      continue;
    }

    // Backfill path: relevant (per auditor) AND missing.
    if (isPresent(product[spec.key])) continue; // never overwrite an existing value
    const comp = spec.completeness_key ? (ATTR[spec.completeness_key] || {}).completeness : null;
    if (!comp) continue;
    const rel = relevanceFor(comp, product, profile);
    if (!rel.relevant) continue;
    let fixability_hint = null;
    try { fixability_hint = deriveFixability(spec.key, product).fixability; } catch { /* keep null */ }
    attrs.push({
      attr: spec.key, feed_name: spec.feed_name, mode: spec.mode, latitude: spec.latitude,
      trigger: 'missing', tier: rel.tier, reason: rel.reason, fixability_hint,
    });
  }
  return attrs;
}

function itemPayload(product, attrs, runtimePatterns, typeOverrides) {
  const { catalog_type } = catalogTypeForProduct(product, runtimePatterns, typeOverrides);
  const { title_formula, description_guidance } = formulasFor(catalog_type);
  // old values for the diff: rewrite attrs carry the original prose; backfill attrs were blank.
  const old = {};
  for (const a of attrs) old[a.attr] = a.trigger === 'weakness' ? (product[a.attr] || '') : '';
  return {
    product_id: product.product_id,
    feed_label: product.feed_label || '',
    target_country: product.target_country || '',
    language: product.language || '',
    title: product.title || '',
    description: product.description || '',
    image_link: product.image_link || '',
    gpc_path_en: product.gpc_path_en || '',
    link: product.link || '',
    product_status: product.product_status || '',
    brand: product.brand || '',
    product_type: product.product_type || '',
    catalog_type,
    title_formula,
    description_guidance,
    source_fields: evidenceFields(product),
    attrs,
    old,
  };
}

// Build the full content worklist. Returns { profile, items, attribute_summary, catalog_type_mix }.
// `typeOverrides` (optional) is the user-confirmed GPC top-level -> catalog_type map from
// worklist --type-override; it steers the formula each product's prompt is built with.
export function buildContentWorklist(products, toggles, { projectRoot, typeOverrides = null } = {}) {
  const profile = buildProfile(products, projectRoot);
  const overrides = loadLexiconOverrides(projectRoot);
  const runtimePatterns = readRuntimeLanguagePatterns(projectRoot);

  const items = [];
  const attribute_summary = {};
  const catalog_type_mix = {};
  for (const product of products) {
    const attrs = attrsForProduct(product, profile, toggles, overrides);
    if (attrs.length === 0) continue;
    const item = itemPayload(product, attrs, runtimePatterns, typeOverrides);
    for (const a of attrs) attribute_summary[a.attr] = (attribute_summary[a.attr] || 0) + 1;
    catalog_type_mix[item.catalog_type] = (catalog_type_mix[item.catalog_type] || 0) + 1;
    items.push(item);
  }
  return {
    profile, items, attribute_summary, catalog_type_mix,
    surface_present: Boolean(profile.demand_gen_or_video_present),
  };
}
