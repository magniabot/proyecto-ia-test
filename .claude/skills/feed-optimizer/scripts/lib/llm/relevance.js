// Relevance facade — decides, per product, which owned attributes are RELEVANT and MISSING, by
// running the feed-auditor relevance engine over the FULL product set (including Merchant-flagged
// products the auditor's completeness module excludes). Single source of truth: the engine and
// catalog are imported, never copied. See docs/adr/0001.

import {
  CATALOG,
  buildBusinessProfile,
  relevanceFor,
  deriveFixability,
} from '../../../../feed-auditor/scripts/lib/modules/completeness.js';
import { OWNED, OWNED_BY_KEY } from './spec-small-attributes.js';

const ATTR = CATALOG.attributes;

export function isPresent(value) {
  return Boolean(value && String(value).trim());
}

// Build the account business profile once (vertical mix, market gates, branded share, etc.).
export function buildProfile(products) {
  return buildBusinessProfile(products);
}

// Resolve relevance for one owned attribute on one product. Returns { relevant, tier, reason }.
function relevanceForOwned(spec, product, profile, toggles) {
  // Opt-in attributes (e.g. adult) are only relevant when explicitly enabled.
  if (spec.opt_in && !(toggles && toggles[spec.key])) return { relevant: false };

  // size_system has no completeness block — it rides on the size attribute + a known market.
  if (spec.key === 'size_system') {
    const sizeComp = ATTR.size.completeness;
    const sizeRel = sizeComp ? relevanceFor(sizeComp, product, profile) : { relevant: false };
    const relevant = Boolean(sizeRel.relevant) || isPresent(product.size);
    if (!relevant) return { relevant: false };
    return { relevant: true, tier: sizeRel.tier || 2, reason: 'size_present_or_relevant' };
  }

  // adult (opt-in) — relevance is "attempt and let the LLM abstain".
  if (spec.key === 'adult') {
    return { relevant: true, tier: 2, reason: 'adult_opt_in' };
  }

  // Default: use the catalog completeness block via the imported auditor engine.
  const comp = spec.completeness_key ? (ATTR[spec.completeness_key] || {}).completeness : null;
  if (!comp) return { relevant: false };
  const r = relevanceFor(comp, product, profile);
  return r.relevant ? { relevant: true, tier: r.tier, reason: r.reason } : { relevant: false };
}

// For one product, the list of owned attributes that are relevant AND currently missing.
// `toggles` (key -> bool) lets the user disable specific attributes; undefined => spec defaults.
export function relevantMissingForProduct(product, profile, toggles) {
  const out = [];
  for (const spec of OWNED) {
    if (toggles && toggles[spec.key] === false) continue;
    const rel = relevanceForOwned(spec, product, profile, toggles);
    if (!rel.relevant) continue;
    if (isPresent(product[spec.key])) continue; // already filled — never overwrite
    // Fixability hint from the auditor: is the value likely present in the title/description text
    // (derivable) or source-required? Advisory only — we still try via the image.
    let fixability_hint = null;
    try { fixability_hint = deriveFixability(spec.key, product).fixability; } catch { /* keep null */ }
    out.push({
      attr: spec.key,
      feed_name: spec.feed_name,
      tier: rel.tier,
      reason: rel.reason,
      latitude: spec.latitude,
      fixability_hint,
    });
  }
  return out;
}

// Whole-catalog pass: returns { profile, items } where items is one entry per product that has at
// least one relevant+missing owned attribute. `items[i] = { product, attrs: [...] }`.
export function buildRelevanceMap(products, toggles) {
  const profile = buildProfile(products);
  const items = [];
  for (const product of products) {
    const attrs = relevantMissingForProduct(product, profile, toggles);
    if (attrs.length > 0) items.push({ product, attrs });
  }
  return { profile, items };
}
