// OpenAI client for the content action. One call per product: image + title + description + GPC path
// + market + category formula + the populated SOURCE_FIELDS (structured facts to recombine) ->
// structured JSON of optimized prose (per requested attribute: value|null, confidence, evidence).
//
// Mirrors openai-client.js (small-attributes) but authors prose instead of extracting enums. The key
// difference is latitude: titles are RECOMBINED from existing facts; descriptions/highlights/detail
// may add benefit framing but every factual claim must be grounded. The API key handling, retries,
// and MOCK mode match small-attributes exactly. Output is re-validated downstream by
// validate-content.js against the SAME auditor detectors that triggered the rewrite.

import { OWNED_BY_KEY } from './spec-content.js';
import { guidanceBlock } from './content-guidance.js';
import { DEFAULT_MODEL, paramStyleFor } from './cost.js';

export { getApiKey } from './openai-client.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function limitsLine(spec) {
  const l = spec.limits || {};
  if (spec.key === 'title') return `Max ${l.char_max || 150} characters; front-load within ${l.front_load || 70}.`;
  if (spec.key === 'description') return `Between ${l.char_min || 500} and ${l.char_max || 1000} characters; key facts within the first ${l.front_load || 160}.`;
  if (spec.key === 'short_title') return `Max ${l.char_max || 65} characters.`;
  if (spec.list) return `${l.min_items || 2}-4 bullets, each <= ${l.item_char_max || 150} characters.`;
  if (spec.structured) return `Each row: section_name/attribute_name <= ${l.attribute_name_char_max || 140}, attribute_value <= ${l.attribute_value_char_max || 1000}.`;
  return '';
}

function attrInstruction(item, attr) {
  const spec = OWNED_BY_KEY.get(attr.attr);
  const latitude = spec.latitude === 'recombine'
    ? 'REASSEMBLE the title to the category formula from the whole evidence pool (old title, '
      + 'description, structured attributes, image) — do NOT just touch up the old title. Treat the old '
      + 'title as a fact source, not a template, and rebuild it: front-load the product type and the '
      + 'highest-value matching attributes, place the brand per the formula, fix capitalisation, and '
      + 'remove duplication. PRESERVE every term that adds matching or buyer value — the core '
      + 'product-type noun, relevant secondary terms/synonyms, and meaningful pack/unit quantities '
      + '(pieces/rolls per pack). Only drop true noise: exact duplication, marketing fluff, and store '
      + 'boilerplate. The new title must be a clear improvement on the old one — richer and cleaner, '
      + 'never thinner on real information. Introduce NO new factual claim — only facts grounded in the '
      + 'evidence pool.'
    : 'You MAY add benefit/rhetorical framing, but every concrete claim must be grounded in the evidence; return null rather than invent a fact.';
  const formula = attr.attr === 'title' ? ` Formula: ${item.title_formula}.`
    : attr.attr === 'description' ? ` Guidance: ${item.description_guidance}.` : '';
  const why = attr.trigger === 'weakness' && attr.reasons && attr.reasons.length ? ` Rewrite because: ${attr.reasons.join('; ')}.` : '';
  return `- ${attr.feed_name}: ${spec.prompt_hint} ${limitsLine(spec)} ${latitude}${formula}${why}`;
}

export function buildMessages(item, steering = '', voice = '') {
  const sys = [
    'You optimize Google Shopping product copy using ONLY the supplied evidence.',
    'Rules:',
    '1. Your evidence pool is the old title, the description, the structured attributes, the GPC category, the target market, and the product image. The image is evidence: you MAY read visible attributes (color, pattern, material/finish) from it and use them as grounded facts. Use NOTHING outside this pool.',
    '2. Titles: REASSEMBLE the title to the category formula using facts from the whole evidence pool. Do NOT just edit the old title — treat it as a fact source, keep its core product-type noun for query match, and reorder/reword/drop the rest. Front-load the product type and highest-value matching attributes; place the brand per the formula. The result must be a clear improvement on the old title. Descriptions/highlights/detail: benefit framing is allowed, but every concrete claim (specs, material, dimensions, compatibility, certifications, brand) must be supported by the evidence.',
    '3. If you cannot improve a field without inventing facts, return null for it. Never guess, never estimate.',
    '4. Forbidden in all outputs: promotional/price/sale text, ALL-CAPS for emphasis, links/URLs, HTML markup, and describing accessories or other products.',
    '5. Put the supporting facts you used in "evidence" for each field.',
    guidanceBlock(item.catalog_type),
    voice ? `Brand voice (phrasing only, never a source of facts): ${voice}` : '',
    steering ? `Additional user instructions: ${steering}` : '',
  ].filter(Boolean).join('\n');

  const factLines = Object.entries(item.source_fields || {}).map(([k, v]) => `  ${k}: ${v}`);
  const textLines = [
    `Existing title: ${item.title || '(none)'}`,
    `Existing description: ${(item.description || '(none)').slice(0, 2000)}`,
    `Google product category: ${item.gpc_path_en || '(none)'}`,
    `Target market: ${item.target_country || '(unknown)'}`,
    `Detected category: ${item.catalog_type}`,
    'Structured facts available to recombine:',
    ...(factLines.length ? factLines : ['  (none beyond title/description)']),
    '',
    'Produce these fields (return null for any you cannot ground):',
    ...item.attrs.map((a) => attrInstruction(item, a)),
  ];

  const content = [{ type: 'text', text: textLines.join('\n') }];
  if (item.image_link) {
    content.push({ type: 'image_url', image_url: { url: item.image_link, detail: item._imageDetail || 'auto' } });
  }
  return [{ role: 'system', content: sys }, { role: 'user', content }];
}

function valueSchemaFor(spec) {
  if (spec.structured) {
    return {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          section_name: { type: 'string' },
          attribute_name: { type: 'string' },
          attribute_value: { type: 'string' },
        },
        required: ['section_name', 'attribute_name', 'attribute_value'],
        additionalProperties: false,
      },
    };
  }
  if (spec.list) return { type: ['array', 'null'], items: { type: 'string' } };
  return { type: ['string', 'null'] };
}

export function buildSchema(item) {
  const properties = {};
  const required = [];
  for (const a of item.attrs) {
    const spec = OWNED_BY_KEY.get(a.attr);
    properties[a.feed_name] = {
      type: 'object',
      properties: {
        value: valueSchemaFor(spec),
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence', 'evidence'],
      additionalProperties: false,
    };
    required.push(a.feed_name);
  }
  return { name: 'content_optimization', strict: true, schema: { type: 'object', properties, required, additionalProperties: false } };
}

function normalizeProposed(item, parsed) {
  const out = {};
  for (const a of item.attrs) {
    const cell = parsed && parsed[a.feed_name];
    out[a.attr] = cell && typeof cell === 'object'
      ? { value: cell.value ?? null, confidence: cell.confidence || 'medium', evidence: cell.evidence || '' }
      : { value: null, confidence: 'low', evidence: '' };
  }
  return out;
}

// ---- mock mode (offline, deterministic) -------------------------------------------------------

function titlecase(s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }

function mockValue(item, attr) {
  const sf = item.source_fields || {};
  const brand = sf.brand || '';
  const ptype = (sf.product_type || item.gpc_path_en || '').split('>').pop().trim();
  const attrsBits = [sf.color, sf.size, sf.material, sf.gender].filter(Boolean);
  if (attr.attr === 'title') {
    const v = [brand, ptype, ...attrsBits].filter(Boolean).join(' ').slice(0, 150);
    return v || null;
  }
  if (attr.attr === 'description') {
    if (!brand && !ptype) return null;
    const lead = `${[brand, ptype].filter(Boolean).join(' ')} with ${attrsBits.join(', ') || 'quality construction'}.`;
    // Pad deterministically into the 500-1000 char target range so mock runs pass validation.
    const filler = ' Designed for everyday use, it combines practical features with reliable build quality, and is well suited to a range of needs.';
    let out = lead;
    while (out.length < 520) out += filler;
    return out.slice(0, 1000);
  }
  if (attr.attr === 'short_title') {
    // short_title excludes the brand (most-important-info only): product type + one attribute.
    const v = [ptype, attrsBits[0]].filter(Boolean).join(' ').slice(0, 65);
    return v || null;
  }
  if (attr.attr === 'product_highlight') {
    const bits = attrsBits.length ? attrsBits.map((b) => `${titlecase(b)} option`) : null;
    return bits;
  }
  if (attr.attr === 'product_detail') {
    const rows = [];
    if (sf.material) rows.push({ section_name: 'General', attribute_name: 'Material', attribute_value: sf.material });
    if (sf.color) rows.push({ section_name: 'General', attribute_name: 'Color', attribute_value: sf.color });
    return rows.length ? rows : null;
  }
  return null;
}

function mockProposed(item) {
  const out = {};
  for (const a of item.attrs) {
    const value = mockValue(item, a);
    out[a.attr] = { value, confidence: value ? 'medium' : 'low', evidence: value ? 'mock: recombined from source_fields' : '' };
  }
  return out;
}

function mockUsage(item) {
  const textTokens = Math.ceil(((item.title || '').length + (item.description || '').length + JSON.stringify(item.source_fields || {}).length) / 4) + 250;
  const imageTokens = item.image_link ? 1100 : 0;
  return { prompt_tokens: textTokens + imageTokens, completion_tokens: 80 * item.attrs.length, total_tokens: 0 };
}

// ---- live call --------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callItem(item, opts = {}) {
  const { model = DEFAULT_MODEL, apiKey = null, steering = '', voice = '', reasoningEffort = 'low', maxRetries = 4, mock = false, fetchImpl = fetch } = opts;
  if (mock || process.env.FEED_OPTIMIZER_MOCK_LLM === '1') {
    return { product_id: item.product_id, proposed: mockProposed(item), usage: mockUsage(item), mocked: true };
  }
  if (!apiKey) throw new Error('OPENAI_API_KEY not available');

  const body = {
    model,
    messages: buildMessages(item, steering, voice),
    response_format: { type: 'json_schema', json_schema: buildSchema(item) },
    // GPT-5.x rejects temperature; effort 'low' keeps prose grounded without long reasoning chains
    // (reasoning tokens bill as output). Legacy models keep the old temperature: 0.2.
    ...(paramStyleFor(model) === 'reasoning' ? { reasoning_effort: reasoningEffort } : { temperature: 0.2 }),
  };

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OpenAI HTTP ${res.status}`);
        await sleep(Math.min(30000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);
      return { product_id: item.product_id, proposed: normalizeProposed(item, parsed), usage: json.usage || {}, mocked: false };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) await sleep(Math.min(30000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr || new Error('callItem failed');
}
