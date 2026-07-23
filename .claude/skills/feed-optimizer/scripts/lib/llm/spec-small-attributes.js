// Small-attributes spec — the owned attribute set for the `small-attributes` action, plus the
// optimizer-only metadata the auditor catalog does not carry (inference latitude, prompt hints,
// dependency rules). Enum sets and char limits are pulled at runtime from the auditor's
// attribute-validation-catalog.json (CATALOG) so there is a single source of truth — see
// docs/adr/0001-feed-auditor-optimizer-runtime-coupling.md.
//
// `latitude`:
//   'infer'   — the LLM may read the product image / obvious context to determine the value
//               (color, material, pattern, gender, age_group).
//   'literal' — the LLM may ONLY lift a value that is literally stated in the supplied text/image
//               (size, dimensions, weight, brand, size_system, adult). Never estimate.
//
// Every attribute is extract-from-evidence with MANDATORY abstention: no evidence -> null.

import { CATALOG } from '../../../../feed-auditor/scripts/lib/modules/completeness.js';

const ATTR = CATALOG.attributes;

// Pull the enum value list for an attribute from the auditor catalog (enum / enum_multi check).
function enumOf(key) {
  const checks = (ATTR[key] && ATTR[key].checks) || [];
  const e = checks.find((c) => c.type === 'enum' || c.type === 'enum_multi');
  return e ? { values: e.values, multi: e.type === 'enum_multi', separator: e.separator || '/', max_items: e.max_items || 1 } : null;
}

// Pull a char_max limit from the auditor catalog.
function charMaxOf(key) {
  const checks = (ATTR[key] && ATTR[key].checks) || [];
  const c = checks.find((x) => x.type === 'char_max');
  return c ? c.limit : null;
}

// Owned attribute set for the small-attributes action. Order is the prompt/output field order.
// `completeness_key` points at the catalog attribute whose `completeness` relevance block decides
// whether the attribute is even relevant for a given product (null = optimizer handles relevance).
export const OWNED = [
  {
    key: 'color', feed_name: 'color', latitude: 'infer', completeness_key: 'color',
    enum: enumOf('color'),
    max_segments: 3, segment_separator: '/', segment_char_max: 40, char_max: 100,
    forbidden: { pattern: '#[0-9a-fA-F]{3,6}', label: 'hex color code' },
    prompt_hint: 'Plain standard color name(s) only (e.g. "red", "navy", "black/white"). Up to 3 via "/". No hex codes, no "multicolor", no "see image".',
  },
  {
    key: 'size', feed_name: 'size', latitude: 'literal', completeness_key: 'size',
    char_max: charMaxOf('size') || 100,
    prompt_hint: 'The size exactly as stated in the title/description (e.g. "M", "42", "10 Wide", "500 ml"). Do not guess a size that is not stated.',
  },
  {
    key: 'size_system', feed_name: 'size_system', latitude: 'literal', completeness_key: null,
    enum: enumOf('size_system'),
    depends_on: 'size', // only relevant when size is present or being filled
    prompt_hint: 'The sizing standard for the size value, inferred from the target market (e.g. US, EU, UK). Only when a size is present/derivable.',
  },
  {
    key: 'size_type', feed_name: 'size_type', latitude: 'infer', completeness_key: 'size_type',
    enum: enumOf('size_type'),
    prompt_hint: 'Apparel cut/fit: regular, petite, plus, tall, big, or maternity. Max 2 via "/". Only if clearly indicated.',
  },
  {
    key: 'gender', feed_name: 'gender', latitude: 'infer', completeness_key: 'gender',
    enum: enumOf('gender'),
    prompt_hint: 'male, female, or unisex — from explicit text ("men\'s", "women\'s") or unambiguous product cues. Use unisex only when genuinely gender-neutral.',
  },
  {
    key: 'age_group', feed_name: 'age_group', latitude: 'infer', completeness_key: 'age_group',
    enum: enumOf('age_group'),
    prompt_hint: 'newborn, infant, toddler, kids, or adult — from explicit cues. Default to adult only when clearly an adult product.',
  },
  {
    key: 'material', feed_name: 'material', latitude: 'infer', completeness_key: 'material',
    char_max: charMaxOf('material') || 200, max_segments: 3, segment_separator: '/',
    prompt_hint: 'Dominant material(s) (e.g. "cotton", "leather/suede"). Up to 3 via "/". Only materials evidenced in text or clearly visible.',
  },
  {
    key: 'pattern', feed_name: 'pattern', latitude: 'infer', completeness_key: 'pattern',
    char_max: charMaxOf('pattern') || 100,
    prompt_hint: 'The pattern/print (e.g. "striped", "floral", "solid"). Only when evidenced.',
  },
  {
    key: 'brand', feed_name: 'brand', latitude: 'literal', completeness_key: 'brand',
    char_max: charMaxOf('brand') || 70,
    prompt_hint: 'The manufacturer/brand name, EXTRACTED verbatim from the title/description (or a clearly legible logo). Never invent or guess a brand.',
  },
  {
    key: 'product_length', feed_name: 'product_length', latitude: 'literal', completeness_key: 'product_length',
    dimension: { units: ['cm', 'in'], range: [1, 3000] },
    prompt_hint: 'Length as a number + unit (cm or in), ONLY if literally stated (e.g. "20 in"). Never estimate from the image.',
  },
  {
    key: 'product_width', feed_name: 'product_width', latitude: 'literal', completeness_key: 'product_width',
    dimension: { units: ['cm', 'in'], range: [1, 3000] },
    prompt_hint: 'Width as a number + unit (cm or in), ONLY if literally stated. Must use the same unit as length/height.',
  },
  {
    key: 'product_height', feed_name: 'product_height', latitude: 'literal', completeness_key: 'product_height',
    dimension: { units: ['cm', 'in'], range: [1, 3000] },
    prompt_hint: 'Height as a number + unit (cm or in), ONLY if literally stated.',
  },
  {
    key: 'product_weight', feed_name: 'product_weight', latitude: 'literal', completeness_key: 'product_weight',
    dimension: { units: ['lb', 'oz', 'g', 'kg'], range: [0, 2000] },
    prompt_hint: 'Assembled weight as a number + unit (lb, oz, g, kg), ONLY if literally stated. Never estimate.',
  },
  {
    key: 'adult', feed_name: 'adult', latitude: 'literal', completeness_key: null,
    opt_in: true, // sensitive — only attempted when explicitly enabled
    enum: { values: ['yes', 'no'], multi: false },
    prompt_hint: 'yes only for adult-oriented products; otherwise no. Only when there is a clear signal.',
  },
];

export const OWNED_KEYS = OWNED.map((a) => a.key);
export const OWNED_BY_KEY = new Map(OWNED.map((a) => [a.key, a]));

// Default per-attribute toggle state. `adult` is off by default (opt-in, sensitive).
export function defaultToggles() {
  const t = {};
  for (const a of OWNED) t[a.key] = !a.opt_in;
  return t;
}
