// OpenAI client for small-attributes extraction.
//
// One call per product: image (detail configurable) + title + description + GPC path + market ->
// structured JSON (per requested attribute: value|null, confidence, evidence). Used by the
// synchronous worker. A deterministic MOCK mode lets the entire
// pipeline run offline (no key, no network) for testing — enabled by FEED_OPTIMIZER_MOCK_LLM=1 or
// opts.mock.
//
// The API key is read from config/.env (Client Env) only; it is never logged, never written to the
// job dir, and never returned to callers.

import { existsSync } from 'fs';
import { resolve } from 'path';
import { parseDotenv } from '../feed-optimizer-core.js';
import { OWNED_BY_KEY } from './spec-small-attributes.js';
import { DEFAULT_MODEL, paramStyleFor } from './cost.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function getApiKey(projectRoot) {
  // Prefer the process env (e.g. exported in shell), else config/.env. Never logged.
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPath = resolve(projectRoot, 'config/.env');
  if (!existsSync(envPath)) return null;
  const env = parseDotenv(envPath);
  return env.OPENAI_API_KEY || null;
}

// ---- prompt + schema construction -------------------------------------------------------------

function attrInstruction(attr) {
  const spec = OWNED_BY_KEY.get(attr.attr);
  const latitude = spec.latitude === 'infer'
    ? 'You MAY read the product image and obvious context to determine this.'
    : 'LITERAL ONLY: copy a value only if it is explicitly stated in the title/description/image. Never estimate.';
  const allowed = spec.enum ? ` Allowed values: ${spec.enum.values.join(', ')}.` : '';
  return `- ${attr.feed_name}: ${spec.prompt_hint} ${latitude}${allowed}`;
}

export function buildMessages(item, steering = '') {
  const requested = item.attrs;
  const sys = [
    'You extract Google Shopping product attributes from supplied evidence ONLY.',
    'Rules:',
    '1. Use ONLY the title, description, GPC category, target market, and product image provided.',
    '2. If the evidence does not support a value, return null for that attribute. Never guess, never invent, never estimate.',
    '3. Each attribute must be backed by the evidence; put the supporting snippet/observation in "evidence".',
    '4. Follow each attribute\'s allowed values and format exactly.',
    steering ? `5. Additional user instructions: ${steering}` : '',
  ].filter(Boolean).join('\n');

  const textLines = [
    `Title: ${item.title || '(none)'}`,
    `Description: ${(item.description || '(none)').slice(0, 2000)}`,
    `Google product category: ${item.gpc_path_en || '(none)'}`,
    `Target market: ${item.target_country || '(unknown)'}`,
    '',
    'Extract these attributes (return null when unsupported):',
    ...requested.map(attrInstruction),
  ];

  const content = [{ type: 'text', text: textLines.join('\n') }];
  if (item.image_link) {
    content.push({ type: 'image_url', image_url: { url: item.image_link, detail: item._imageDetail || 'low' } });
  }
  return [
    { role: 'system', content: sys },
    { role: 'user', content },
  ];
}

export function buildSchema(item) {
  const properties = {};
  const required = [];
  for (const a of item.attrs) {
    properties[a.feed_name] = {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence', 'evidence'],
      additionalProperties: false,
    };
    required.push(a.feed_name);
  }
  return {
    name: 'small_attributes',
    strict: true,
    schema: { type: 'object', properties, required, additionalProperties: false },
  };
}

// Map the model's feed_name-keyed object back to attr-key-keyed { value, confidence, evidence }.
function normalizeProposed(item, parsed) {
  const out = {};
  for (const a of item.attrs) {
    const cell = parsed && parsed[a.feed_name];
    out[a.attr] = cell && typeof cell === 'object'
      ? { value: cell.value, confidence: cell.confidence || 'medium', evidence: cell.evidence || '' }
      : { value: null, confidence: 'low', evidence: '' };
  }
  return out;
}

// ---- mock mode (offline) ----------------------------------------------------------------------

const MOCK_WORDS = {
  color: ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey', 'gray', 'beige', 'gold', 'silver', 'navy', 'zwart', 'wit', 'rood', 'blauw', 'groen', 'geel', 'roze', 'bruin', 'grijs'],
  material: ['cotton', 'leather', 'wool', 'polyester', 'silk', 'denim', 'linen', 'nylon', 'wood', 'metal', 'steel', 'glass', 'plastic', 'katoen', 'leer', 'hout', 'metaal', 'glas', 'kunststof', 'hdpe', 'ldpe', 'pp', 'papier', 'paper'],
  gender: { men: 'male', mens: 'male', heren: 'male', women: 'female', womens: 'female', dames: 'female', unisex: 'unisex' },
  pattern: ['striped', 'floral', 'solid', 'plaid', 'checked', 'gestreept', 'gebloemd', 'effen', 'geruit'],
};

function mockProposed(item) {
  const hay = `${item.title} ${item.description}`.toLowerCase();
  const out = {};
  for (const a of item.attrs) {
    let value = null;
    if (a.attr === 'color') value = MOCK_WORDS.color.find((w) => new RegExp(`\\b${w}\\b`).test(hay)) || null;
    else if (a.attr === 'material') value = MOCK_WORDS.material.find((w) => new RegExp(`\\b${w}\\b`).test(hay)) || null;
    else if (a.attr === 'pattern') value = MOCK_WORDS.pattern.find((w) => new RegExp(`\\b${w}\\b`).test(hay)) || null;
    else if (a.attr === 'gender') { const k = Object.keys(MOCK_WORDS.gender).find((w) => new RegExp(`\\b${w}\\b`).test(hay)); value = k ? MOCK_WORDS.gender[k] : null; }
    else if (a.attr === 'brand') { const m = (item.title || '').match(/^([A-Z][A-Za-z0-9&'-]+)/); value = m ? m[1] : null; }
    out[a.attr] = { value, confidence: value ? 'medium' : 'low', evidence: value ? 'mock: found in text' : '' };
  }
  return out;
}

function mockUsage(item) {
  const textTokens = Math.ceil(((item.title || '').length + (item.description || '').length) / 4) + 200;
  const imageTokens = item.image_link ? 1100 : 0; // approximate flat low-detail image cost
  return { prompt_tokens: textTokens + imageTokens, completion_tokens: 30 * item.attrs.length, total_tokens: 0 };
}

// ---- live call --------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callItem(item, opts = {}) {
  const { model = DEFAULT_MODEL, apiKey = null, steering = '', reasoningEffort = 'none', maxRetries = 4, mock = false, fetchImpl = fetch } = opts;
  if (mock || process.env.FEED_OPTIMIZER_MOCK_LLM === '1') {
    return { product_id: item.product_id, proposed: mockProposed(item), usage: mockUsage(item), mocked: true };
  }
  if (!apiKey) throw new Error('OPENAI_API_KEY not available');

  const body = {
    model,
    messages: buildMessages(item, steering),
    response_format: { type: 'json_schema', json_schema: buildSchema(item) },
    // GPT-5.x rejects temperature; effort 'none' suits deterministic extraction. Legacy models
    // reject reasoning_effort and get the old temperature: 0.
    ...(paramStyleFor(model) === 'reasoning' ? { reasoning_effort: reasoningEffort } : { temperature: 0 }),
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
