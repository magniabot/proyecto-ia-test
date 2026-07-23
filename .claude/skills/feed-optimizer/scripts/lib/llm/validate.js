// Output validation — re-checks every LLM-proposed value against the auditor catalog rules
// (enum membership, char limits, no hex, <=3 color segments, dimension format, low-quality words).
// A value that fails validation is treated as an abstention (demoted to the exceptions lane), so an
// invalid value is NEVER written into the supplemental feed. Single source of truth for enums/limits
// is the imported catalog via spec-small-attributes.js.

import { CATALOG } from '../../../../feed-auditor/scripts/lib/modules/completeness.js';
import { OWNED_BY_KEY } from './spec-small-attributes.js';

const LOW_QUALITY = new Set((CATALOG.low_quality_values || []).map((v) => v.toLowerCase()));

function norm(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

// Returns { ok, value, reason }. ok=false with reason 'abstained' for empty/unknown; reason
// 'invalid:<why>' when the LLM returned something that violates the catalog.
export function validateValue(attrKey, rawValue) {
  const spec = OWNED_BY_KEY.get(attrKey);
  if (!spec) return { ok: false, value: '', reason: 'invalid:unknown-attribute' };

  let value = norm(rawValue);
  if (!value || ['unknown', 'n/a', 'na', 'none', 'null'].includes(value.toLowerCase())) {
    return { ok: false, value: '', reason: 'abstained' };
  }
  if (LOW_QUALITY.has(value.toLowerCase())) {
    return { ok: false, value: '', reason: 'invalid:low-quality-value' };
  }

  // Forbidden pattern (e.g. hex color).
  if (spec.forbidden && new RegExp(spec.forbidden.pattern).test(value)) {
    return { ok: false, value: '', reason: `invalid:${spec.forbidden.label}` };
  }

  // Enum / enum_multi.
  if (spec.enum) {
    const allowed = spec.enum.values;
    const upper = attrKey === 'size_system';
    const cmp = (s) => (upper ? s.toUpperCase() : s.toLowerCase());
    const allowedSet = new Set(allowed.map(cmp));
    if (spec.enum.multi) {
      const sep = spec.enum.separator || '/';
      const parts = value.split(sep).map((p) => norm(p)).filter(Boolean);
      if (parts.length === 0) return { ok: false, value: '', reason: 'abstained' };
      if (spec.enum.max_items && parts.length > spec.enum.max_items) {
        return { ok: false, value: '', reason: 'invalid:too-many-values' };
      }
      for (const p of parts) if (!allowedSet.has(cmp(p))) return { ok: false, value: '', reason: `invalid:not-in-enum(${p})` };
      const canon = parts.map((p) => (upper ? p.toUpperCase() : p.toLowerCase())).join(sep);
      return { ok: true, value: canon, reason: 'ok' };
    }
    if (!allowedSet.has(cmp(value))) return { ok: false, value: '', reason: `invalid:not-in-enum` };
    return { ok: true, value: upper ? value.toUpperCase() : value.toLowerCase(), reason: 'ok' };
  }

  // Dimension: number + unit within range.
  if (spec.dimension) {
    const m = value.toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/);
    if (!m) return { ok: false, value: '', reason: 'invalid:dimension-format' };
    const num = parseFloat(m[1].replace(',', '.'));
    const unit = m[2];
    if (!spec.dimension.units.includes(unit)) return { ok: false, value: '', reason: `invalid:unit(${unit})` };
    const [lo, hi] = spec.dimension.range;
    if (!(num >= lo && num <= hi)) return { ok: false, value: '', reason: 'invalid:out-of-range' };
    return { ok: true, value: `${num} ${unit}`, reason: 'ok' };
  }

  // Segment rules (color/material): max segments + per-segment + total length.
  if (spec.max_segments) {
    const sep = spec.segment_separator || '/';
    const parts = value.split(sep).map((p) => norm(p)).filter(Boolean);
    if (parts.length > spec.max_segments) return { ok: false, value: '', reason: 'invalid:too-many-segments' };
    if (spec.segment_char_max && parts.some((p) => p.length > spec.segment_char_max)) {
      return { ok: false, value: '', reason: 'invalid:segment-too-long' };
    }
    value = parts.join(sep);
  }

  // Char max.
  if (spec.char_max && value.length > spec.char_max) {
    return { ok: false, value: '', reason: 'invalid:too-long' };
  }

  return { ok: true, value, reason: 'ok' };
}

// Validate a full proposed attribute map for one product. `proposed` = { attr: {value, confidence} }.
// `floor` = minimum confidence to accept ('low'|'medium'|'high'); default accepts unless 'low'.
// Returns { filled: {attr: value}, exceptions: [{attr, reason, proposed, confidence}] }.
const CONF_RANK = { low: 0, medium: 1, high: 2 };
export function validateProduct(proposed, requestedAttrs, floor = 'low') {
  const filled = {};
  const exceptions = [];
  const floorRank = CONF_RANK[floor] ?? 0;
  for (const attrKey of requestedAttrs) {
    const cell = proposed && proposed[attrKey];
    const rawValue = cell && typeof cell === 'object' ? cell.value : cell;
    const confidence = (cell && typeof cell === 'object' && cell.confidence) || 'medium';
    const res = validateValue(attrKey, rawValue);
    if (!res.ok) {
      // Pure abstention is expected (no evidence) — record it as an exception with its reason.
      exceptions.push({ attr: attrKey, reason: res.reason, proposed: norm(rawValue), confidence });
      continue;
    }
    // Confidence floor: demote sub-floor values to exceptions rather than into the feed.
    if ((CONF_RANK[confidence] ?? 1) < floorRank) {
      exceptions.push({ attr: attrKey, reason: `below-confidence-floor(${confidence}<${floor})`, proposed: res.value, confidence });
      continue;
    }
    filled[attrKey] = res.value;
  }
  return { filled, exceptions };
}
