// Output validation for the content action. Every authored value is re-checked against the SAME
// auditor detectors that trigger a rewrite (titleIssues / descriptionIssues) plus the shared
// prohibited-content policy (prohibitedContentIssues) and the CATALOG.content_limits char/structure
// limits. A value that fails is demoted to the exceptions lane (the original is kept) — an invalid or
// policy-violating value is NEVER written into the supplemental feed. This closes the loop: content
// can only emit prose the auditor would not immediately re-flag.

import {
  titleIssues, descriptionIssues, prohibitedContentIssues,
} from '../../../../feed-auditor/scripts/lib/feed-auditor-core.js';
import { OWNED_BY_KEY, SUPPRESSED_TITLE_REASONS } from './spec-content.js';

function norm(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

// Google text-feed convention: multiple values share a column comma-separated; we strip internal
// commas to keep the field parseable. Documented in the output README.
function serializeHighlights(arr) {
  return arr.map((s) => norm(s).replace(/,/g, ';')).filter(Boolean).join(',');
}
function serializeDetails(arr) {
  return arr
    .map((r) => `${norm(r.section_name)}:${norm(r.attribute_name)}:${norm(r.attribute_value)}`.replace(/,/g, ';'))
    .filter(Boolean)
    .join(',');
}

// Validate one authored cell. Returns { ok, value, reason } where `value` is the CSV-ready string.
export function validateValue(attrKey, rawValue, ctx, overrides) {
  const spec = OWNED_BY_KEY.get(attrKey);
  if (!spec) return { ok: false, value: '', reason: 'invalid:unknown-attribute' };
  const L = spec.limits || {};
  const policyCtx = { brand: ctx.brand || '', product_type: ctx.product_type || '', language: ctx.language || '' };

  // Structured: product_detail.
  if (spec.structured) {
    if (!Array.isArray(rawValue)) return { ok: false, value: '', reason: 'abstained' };
    const rows = [];
    for (const r of rawValue) {
      if (!r || typeof r !== 'object') continue;
      const sn = norm(r.section_name); const an = norm(r.attribute_name); const av = norm(r.attribute_value);
      if (!an || !av) continue;
      if (an.length > (L.attribute_name_char_max || 140) || av.length > (L.attribute_value_char_max || 1000)) continue;
      if (sn.length > (L.section_name_char_max || 140)) continue;
      if (prohibitedContentIssues({ text: `${an} ${av}`, ...policyCtx }, overrides).length) continue;
      rows.push({ section_name: sn || 'General', attribute_name: an, attribute_value: av });
      if (rows.length >= (L.max_items || 1000)) break;
    }
    if (rows.length === 0) return { ok: false, value: '', reason: 'abstained' };
    return { ok: true, value: serializeDetails(rows), reason: 'ok' };
  }

  // List: product_highlight.
  if (spec.list) {
    if (!Array.isArray(rawValue)) return { ok: false, value: '', reason: 'abstained' };
    const bullets = [];
    for (const b of rawValue) {
      const v = norm(b);
      if (!v || v.length > (L.item_char_max || 150)) continue;
      if (prohibitedContentIssues({ text: v, ...policyCtx }, overrides).length) continue;
      bullets.push(v);
      if (bullets.length >= (L.max_items || 100)) break;
    }
    if (bullets.length < (L.min_items || 2)) return { ok: false, value: '', reason: 'invalid:too-few-highlights' };
    return { ok: true, value: serializeHighlights(bullets), reason: 'ok' };
  }

  // Scalar prose: title / description / short_title.
  const v = norm(rawValue);
  if (!v || ['null', 'n/a', 'none'].includes(v.toLowerCase())) return { ok: false, value: '', reason: 'abstained' };
  if (L.char_max && v.length > L.char_max) return { ok: false, value: '', reason: 'invalid:too-long' };
  if (L.char_min && v.length < L.char_min) return { ok: false, value: '', reason: 'invalid:too-short' };

  let reasons = [];
  if (attrKey === 'title') reasons = titleIssues({ title: v, ...policyCtx }, overrides).filter((r) => !SUPPRESSED_TITLE_REASONS.has(r));
  else if (attrKey === 'description') reasons = descriptionIssues({ description: v, brand: policyCtx.brand, language: policyCtx.language }, overrides);
  else reasons = prohibitedContentIssues({ text: v, ...policyCtx }, overrides); // short_title
  if (reasons.length) return { ok: false, value: '', reason: `invalid:${reasons[0]}` };

  return { ok: true, value: v, reason: 'ok' };
}

const CONF_RANK = { low: 0, medium: 1, high: 2 };

// Validate a full proposed map for one product. `item` carries brand/product_type/language/attrs.
// Returns { filled: {attr: csvString}, exceptions: [{attr, reason, proposed, confidence}] }.
export function validateProduct(proposed, item, floor = 'low', overrides = { promo: {}, boilerplate: {} }) {
  const filled = {};
  const exceptions = [];
  const floorRank = CONF_RANK[floor] ?? 0;
  const ctx = { brand: item.brand, product_type: item.product_type, language: item.language };
  for (const a of item.attrs) {
    const attrKey = a.attr;
    const cell = proposed && proposed[attrKey];
    const rawValue = cell && typeof cell === 'object' ? cell.value : cell;
    const confidence = (cell && typeof cell === 'object' && cell.confidence) || 'medium';
    const res = validateValue(attrKey, rawValue, ctx, overrides);
    if (!res.ok) {
      const proposedStr = Array.isArray(rawValue) ? JSON.stringify(rawValue).slice(0, 200) : norm(rawValue);
      exceptions.push({ attr: attrKey, reason: res.reason, proposed: proposedStr, confidence });
      continue;
    }
    if ((CONF_RANK[confidence] ?? 1) < floorRank) {
      exceptions.push({ attr: attrKey, reason: `below-confidence-floor(${confidence}<${floor})`, proposed: res.value, confidence });
      continue;
    }
    filled[attrKey] = res.value;
  }
  return { filled, exceptions };
}
