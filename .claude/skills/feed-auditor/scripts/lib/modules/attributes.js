// Attribute analyser module.
//
// Answers: "are the attributes that ARE present correct & well-structured?"
// Presence is the Completeness module's job; this module never flags a blank attribute —
// EXCEPT dependency integrity (an attribute present that demands a companion which is missing).
//
// Coverage: every Data-Spec attribute this module OWNS (non-owned attributes — title,
// description, image_link, price/availability matching, link, raw presence — belong to
// title-desc / images / errors / completeness). Deterministic rules live in the data-driven
// attribute-validation-catalog.json (source of truth); Claude layers the design judgments
// (product_type / google_product_category taxonomy) on top from reference/.
//
// Routing is two-lane by fixability:
//   - optimizer:derivable / optimizer:strategy -> /feed-optimizer (CSV-fixable)
//   - source-required / external               -> advisory brief (human/source action)
// Every finding carries a severity tier (critical/important/recommended/optional) from the
// Optimization Guidelines priority framework; it drives report + handoff ORDER, not the score.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { FIXABILITY, makeQueueRow, scoreFromAffected, normText, isAdvisory } from './shared.js';

export const id = 'attributes';
export const label = 'Attribute analyser';
export const weight = 20;

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(resolve(__dirname, 'attribute-validation-catalog.json'), 'utf8'));
const LOW_QUALITY = new Set(CATALOG.low_quality_values.map((value) => value.toLowerCase()));
const OWNED_ATTRIBUTES = Object.keys(CATALOG.attributes);

function gs1Valid(raw) {
  const value = String(raw).trim();
  if (!/^\d+$/.test(value)) return false;
  if (![8, 12, 13, 14].includes(value.length)) return false;
  const digits = value.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, weight3 = 3; i >= 0; i -= 1, weight3 = weight3 === 3 ? 1 : 3) {
    sum += digits[i] * weight3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

function productTypeDepth(value) {
  const paths = String(value || '').split('|').map((part) => part.trim()).filter(Boolean);
  const depths = paths.map((path) => path.split('>').map((segment) => segment.trim()).filter(Boolean).length);
  return depths.length ? Math.max(...depths) : 0;
}

// Each evaluator returns a human-readable violation detail string, or null if the value is valid.
const EVALUATORS = {
  enum(check, value) {
    const candidates = check.case_sensitive ? check.values : check.values.map((v) => v.toLowerCase());
    const probe = check.case_sensitive ? String(value).trim() : normText(value);
    return candidates.includes(probe) ? null : `value "${value}" is not a valid enum (expected ${check.values.join('/')})`;
  },
  enum_multi(check, value) {
    const sep = check.separator === '|' ? /\|/ : new RegExp(`[${check.separator || '/'},]`);
    const parts = String(value).split(sep).map((p) => p.trim()).filter(Boolean);
    if (check.max_items && parts.length > check.max_items) return `has ${parts.length} values (max ${check.max_items})`;
    const allowed = check.case_sensitive ? check.values : check.values.map((v) => v.toLowerCase());
    const bad = parts.filter((p) => !allowed.includes(check.case_sensitive ? p : p.toLowerCase()));
    return bad.length ? `value "${value}" contains invalid token(s): ${bad.join(', ')}` : null;
  },
  boolean(check, value) {
    return ['true', 'false'].includes(normText(value)) ? null : `value "${value}" must be true or false`;
  },
  char_max(check, value) {
    const len = String(value).length;
    return len > check.limit ? `exceeds the ${check.limit}-character limit (${len})` : null;
  },
  segment_char_max(check, value) {
    if (check.max_total && String(value).length > check.max_total) return `exceeds ${check.max_total} total characters`;
    const over = String(value).split(check.separator || '/').find((seg) => seg.trim().length > check.per_limit);
    return over !== undefined ? `a segment exceeds the ${check.per_limit}-character per-value limit` : null;
  },
  max_segments(check, value) {
    const segments = String(value).split(check.separator || '/').map((s) => s.trim()).filter(Boolean);
    return segments.length > check.max ? `has ${segments.length} values (max ${check.max} via "${check.separator || '/'}")` : null;
  },
  forbidden_regex(check, value) {
    const re = new RegExp(check.pattern, check.flags || '');
    return re.test(String(value)) ? (check.label || 'matches a forbidden pattern') : null;
  },
  low_quality(check, value) {
    return LOW_QUALITY.has(normText(value)) ? `value "${value}" is generic/low-quality` : null;
  },
  gs1(check, value) {
    const parts = String(value).split('|').map((p) => p.trim()).filter(Boolean);
    const bad = parts.find((p) => !gs1Valid(p));
    return bad !== undefined ? `"${bad}" is not a valid GS1 identifier (8/12/13/14 digits with a valid check digit)` : null;
  },
  numeric_int(check, value) {
    return /^\d+$/.test(String(value).trim()) ? null : `value "${value}" is not a whole number`;
  },
  measure_format(check, value) {
    const match = String(value).trim().match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
    if (!match) return `value "${value}" is not a number + unit`;
    if (check.units && !check.units.map((u) => u.toLowerCase()).includes(match[2].toLowerCase())) {
      return `unit "${match[2]}" is not one of ${check.units.join('/')}`;
    }
    return null;
  },
  measure_base(check, value) {
    const match = String(value).trim().match(/^([\d.,]+)\s*[a-zA-Z]*$/);
    if (!match) return `value "${value}" is not a valid base measure`;
    const num = parseFloat(match[1].replace(',', '.'));
    return check.allowed.includes(num) ? null : `base measure ${num} is not one of ${check.allowed.join('/')}`;
  },
  currency_format(check, value) {
    return /^[\d.,]+\s+[A-Z]{3}$/.test(String(value).trim()) ? null : `value "${value}" is not "<amount> <ISO 4217 currency>"`;
  },
  iso_datetime(check, value) {
    return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([.\d]*([+-]\d{2}:?\d{2}|Z)?)?)?(\/.+)?$/.test(String(value).trim())
      ? null
      : `value "${value}" is not an ISO 8601 date/datetime`;
  },
  certification_format(check, value) {
    const parts = String(value).split('|').map((p) => p.trim()).filter(Boolean);
    const bad = parts.find((p) => !/^[^:]+:[^:]+:[^:]+$/.test(p));
    return bad !== undefined ? `"${bad}" is not "authority:name:code"` : null;
  },
  path_or_id(check, value) {
    const v = String(value).trim();
    return /^\d+$/.test(v) || v.includes('>') ? null : `value "${v.slice(0, 40)}" is neither a numeric ID nor a full ">"-delimited path`;
  },
  min_depth(check, value) {
    const depth = productTypeDepth(value);
    return depth <= check.min - 1 ? `is flat (depth ${depth}) — limited segmentation control` : null;
  },
  id_format(check, value) {
    const v = String(value);
    if (/\s/.test(v)) return 'contains whitespace (IDs must have no spaces)';
    if (check.limit && v.length > check.limit) return `exceeds the ${check.limit}-character limit (${v.length})`;
    return null;
  },
};

// Cross-attribute dependency integrity: a present attribute demands a companion that is absent.
// This is the ONE place the module reasons about a missing attribute (companion), per the
// attributes/completeness boundary (attributes owns dependency integrity; completeness owns
// standalone relevance).
const DEPENDENCIES = [
  {
    when: (product) => Boolean(product.size),
    missing: (product) => !product.size_system,
    attribute: 'size_system',
    finding: 'size is present but size_system is missing — size values are ambiguous without a system',
    fixability: FIXABILITY.OPTIMIZER_DERIVABLE,
    optimizer_action: 'size-system',
    confidence: 'medium',
    severity: 'recommended',
  },
  {
    when: (product) => ['preorder', 'backorder'].includes(normText(product.availability)),
    missing: (product) => !product.availability_date,
    attribute: 'availability_date',
    finding: 'availability is preorder/backorder but availability_date is missing (required)',
    fixability: FIXABILITY.SOURCE_REQUIRED,
    confidence: 'high',
    severity: 'important',
  },
  {
    when: (product) => Boolean(product.unit_pricing_measure),
    missing: (product) => !product.unit_pricing_base_measure,
    attribute: 'unit_pricing_base_measure',
    finding: 'unit_pricing_measure is present but unit_pricing_base_measure is missing (required)',
    fixability: FIXABILITY.SOURCE_REQUIRED,
    confidence: 'medium',
    severity: 'recommended',
  },
  {
    when: (product) => Boolean(product.energy_efficiency_class),
    missing: (product) => !product.min_energy_efficiency_class || !product.max_energy_efficiency_class,
    attribute: 'min_energy_efficiency_class',
    finding: 'energy_efficiency_class is present but min/max_energy_efficiency_class is missing (required together)',
    fixability: FIXABILITY.SOURCE_REQUIRED,
    confidence: 'high',
    severity: 'important',
  },
];

export function build({ products }) {
  const queueRows = [];
  const affected = new Set();
  let eligible = 0;

  const add = (product, fields) => {
    queueRows.push(makeQueueRow(product, id, fields));
    affected.add(product.product_id);
  };

  for (const product of products) {
    const hasOwnedAttribute = OWNED_ATTRIBUTES.some((attribute) => product[attribute]);
    if (!hasOwnedAttribute) continue; // nothing present to assess
    eligible += 1;

    // 1. Catalog-driven per-value validity (present attributes only).
    for (const attribute of OWNED_ATTRIBUTES) {
      const value = product[attribute];
      if (!value) continue;
      const def = CATALOG.attributes[attribute];
      for (const check of def.checks) {
        const evaluator = EVALUATORS[check.type];
        if (!evaluator) continue;
        const detail = evaluator(check, value);
        if (!detail) continue;
        add(product, {
          finding: `${def.feed_name} ${detail}`,
          attribute: def.feed_name,
          fixability_class: check.fixability,
          optimizer_action: check.optimizer_action,
          confidence: check.confidence || 'medium',
          severity: check.severity || def.tier,
          priority_basis: def.tier,
        });
      }
    }

    // 2. Cross-attribute dependency integrity.
    for (const dependency of DEPENDENCIES) {
      if (dependency.when(product) && dependency.missing(product)) {
        add(product, {
          finding: dependency.finding,
          attribute: dependency.attribute,
          fixability_class: dependency.fixability,
          optimizer_action: dependency.optimizer_action,
          confidence: dependency.confidence,
          severity: dependency.severity,
          priority_basis: `dependency:${dependency.severity}`,
        });
      }
    }
  }

  // Advisory brief: source-required / external findings grouped by the actor who must act.
  const advisoryRows = queueRows.filter((row) => isAdvisory(row.fixability_class));
  const briefSections = [
    {
      actor: 'Source feed / ecommerce platform / Channable',
      rows: advisoryRows.filter((row) => row.fixability_class === FIXABILITY.SOURCE_REQUIRED),
      note: 'These values exist nowhere in the feed and cannot be derived — fix them at the data source.',
    },
    {
      actor: 'Manufacturer / GS1 / certification authority',
      rows: advisoryRows.filter((row) => row.fixability_class === FIXABILITY.EXTERNAL),
      note: 'These need an authoritative external correction (e.g. a valid GTIN/check digit or certification code). Never fabricate them.',
    },
  ];

  return {
    id,
    label,
    weight,
    applicable: eligible > 0,
    eligible,
    affected: affected.size,
    score: scoreFromAffected(affected, eligible),
    findings: queueRows.length,
    queueRows,
    briefSections,
    notes: `${affected.size} of ${eligible} product(s) with present attributes have a structure/value-quality issue across ${OWNED_ATTRIBUTES.length} owned attributes; ${advisoryRows.length} finding(s) route to the advisory brief (source/external).`,
  };
}
