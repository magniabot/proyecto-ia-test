// Content spec — the owned attribute set for the feed-optimizer `content` action (the prose
// counterpart to spec-small-attributes.js). Two trigger modes coexist in ONE call per product:
//
//   mode 'rewrite'  (title, description) — only when the auditor's weakness detectors fire on the
//                   EXISTING value (titleIssues / descriptionIssues). Never rewrites copy that
//                   already passes. The candidate is re-validated by the SAME detectors on output.
//   mode 'backfill' (short_title, product_highlight, product_detail) — only when the value is
//                   MISSING and relevant per the auditor completeness engine (short_title rides the
//                   demand_gen_surface gate; highlight/detail are 'always' Tier-4). Never overwrites.
//
// `latitude`:
//   'recombine'        — title: reorder/front-load facts that already exist in the feed (the
//                        category formula). No new factual claims, no marketing latitude.
//   'compose-grounded' — description/short_title/highlight/detail: may add rhetorical/benefit framing
//                        but every FACTUAL claim (specs, materials, dimensions, compatibility,
//                        certifications, brand) must be grounded in the supplied evidence. No invented
//                        facts. Abstain (return null) rather than guess.
//
// Char/structure limits come from CATALOG.content_limits (single source of truth — see
// attribute-validation-catalog.json), never hardcoded here.

import { CATALOG } from '../../../../feed-auditor/scripts/lib/modules/completeness.js';

const L = CATALOG.content_limits || {};

export const OWNED = [
  {
    key: 'title', feed_name: 'title', mode: 'rewrite', latitude: 'recombine',
    trigger: 'weakness', completeness_key: null, limits: L.title || { char_max: 150, front_load: 70 },
    prompt_hint:
      'Treat the category formula as a priority order: front-load the product type and the '
      + 'highest-value matching attributes within the first ~70 characters, use up to 150 for '
      + 'additional matching attributes, and place the brand per the formula. Join the segments with '
      + '" | " (space-pipe-space), e.g. "Product type | Key attribute | Brand"; include only segments '
      + 'you have a grounded value for and drop the rest (never output an empty " | "). KEEP every term '
      + 'that adds matching or buyer value: relevant secondary product terms/synonyms present in the '
      + 'old title (e.g. "sneakers" alongside "shoes") and meaningful pack/unit quantities '
      + '(e.g. "6 rolls", "100 pieces per box" — what the buyer receives). Use the full 150 characters when '
      + 'there are real matching terms to include — do not strip the title down to a bare minimum. Only '
      + 'drop true noise: exact duplication, marketing fluff, and store boilerplate. The result must be '
      + 'clearly better than the old title — richer matching, cleaner order, never thinner on real '
      + 'information. No promotional text, no ALL-CAPS, no price.',
  },
  {
    key: 'description', feed_name: 'description', mode: 'rewrite', latitude: 'compose-grounded',
    trigger: 'weakness', completeness_key: null, limits: L.description || { char_max: 5000, front_load: 160 },
    prompt_hint:
      'Rewrite the description using the category template, 500-1000 characters (a full, informative '
      + 'paragraph — not a one-liner, not a wall of text). Put the key grounded facts in the first 160 '
      + 'characters (product type, key specs, materials/dimensions/capacity, pack quantity). THEN reach '
      + 'the target length by adding genuinely useful context a buyer — or an AI shopping assistant '
      + 'answering "which one should I get for X?" — would want: typical use cases and applications, '
      + 'who it is for, where/how it is used, and what is included. This use-case and audience context '
      + 'is the main, legitimate way to reach length. Two hard limits: (a) invent NO new concrete claim '
      + '(specs, materials, certifications, compatibility, performance numbers) — those need evidence; '
      + 'frame only what is grounded. (b) Do NOT pad with empty marketing clichés ("great quality", '
      + '"you\'ll love it", "perfect for everyday use") or keyword stuffing — every sentence must add '
      + 'real information or genuine use context. If you still cannot reach 500 characters honestly, '
      + 'return what you have (it will abstain) rather than pad or invent. No links, no HTML, no '
      + 'promotional/price text, no ALL-CAPS, do not describe accessories or other products.',
  },
  {
    key: 'short_title', feed_name: 'short_title', mode: 'backfill', latitude: 'compose-grounded',
    trigger: 'missing', completeness_key: 'short_title', limits: L.short_title || { char_max: 65 },
    prompt_hint:
      'A concise short title (<=65 chars): the product type plus the single most important/defining '
      + 'attribute, in the fewest words, for browse/Demand Gen surfaces. Do NOT include the brand — '
      + 'short_title is the most-important-info-only field. Grounded in existing facts only.',
  },
  {
    key: 'product_highlight', feed_name: 'product_highlight', mode: 'backfill', latitude: 'compose-grounded',
    trigger: 'missing', completeness_key: 'product_highlight', list: true,
    limits: L.product_highlight || { item_char_max: 150, min_items: 2, max_items: 100 },
    prompt_hint:
      'Return 2-4 short benefit bullets (each <=150 chars), each stating one concrete, evidence-backed '
      + 'feature/benefit. No promotional text, no redundant repetition of the title.',
  },
  {
    key: 'product_detail', feed_name: 'product_detail', mode: 'backfill', latitude: 'compose-grounded',
    trigger: 'missing', completeness_key: 'product_detail', structured: true,
    limits: L.product_detail || { section_name_char_max: 140, attribute_name_char_max: 140, attribute_value_char_max: 1000, max_items: 1000 },
    prompt_hint:
      'Return structured spec rows as {section_name, attribute_name, attribute_value} objects, ONLY '
      + 'for facts explicitly present in the evidence (e.g. Material, Dimensions, Capacity). Never '
      + 'invent a spec value. Omit rather than guess.',
  },
];

// Title weakness reasons the content action deliberately IGNORES. `title may be missing product_type
// leaf terms` fires off the product_type field's leaf, which in real feeds is often a generic
// category ("Inpakken en bescherming") or mis-tagged — satisfying it would force generic category
// keywords into an otherwise-good title. We therefore (a) never reject a rewrite for this reason and
// (b) never surface it to the model as a rewrite instruction. Fixing product_type itself is the job
// of the `/feed-optimizer product-type` action, not content.
export const SUPPRESSED_TITLE_REASONS = new Set([
  'title may be missing product_type leaf terms',
]);

export const OWNED_KEYS = OWNED.map((a) => a.key);
export const OWNED_BY_KEY = new Map(OWNED.map((a) => [a.key, a]));
export const FEED_NAME = new Map(OWNED.map((a) => [a.key, a.feed_name]));

// All five default ON. The sample loop lets the user disable any via --disable / --only.
export function defaultToggles() {
  const t = {};
  for (const a of OWNED) t[a.key] = true;
  return t;
}
