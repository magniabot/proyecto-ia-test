// Cost model + model registry — token→dollar pricing, per-item cost from measured API usage, and
// full-run projection from the sample's measured tokens. Pricing is configurable (job config.pricing)
// because provider prices change; defaults below are USD per 1M tokens (snapshot: June 2026).
//
// The registry is the single source of truth for which models the LLM actions accept and how each
// model is parameterized: `params: 'temperature'` (4o/4.1 era) vs `params: 'reasoning'` (GPT-5.x,
// which reject the temperature field and take reasoning_effort instead).

// USD per 1,000,000 tokens. cached_input applies to usage.prompt_tokens_details.cached_tokens.
export const MODELS = {
  // GPT-5.4 family — reasoning models; vision + structured outputs; reasoning tokens bill as output.
  'gpt-5.4':      { input: 2.50, cached_input: 0.25,  output: 15.00, params: 'reasoning' },
  'gpt-5.4-mini': { input: 0.75, cached_input: 0.075, output: 4.50,  params: 'reasoning' },
  'gpt-5.4-nano': { input: 0.20, cached_input: 0.02,  output: 1.25,  params: 'reasoning' },
  // Legacy temperature-style models, kept so existing jobs/configs keep pricing correctly.
  'gpt-4o-mini':  { input: 0.15, output: 0.60,  params: 'temperature' },
  'gpt-4.1-mini': { input: 0.40, output: 1.60,  params: 'temperature' },
  'gpt-4o':       { input: 2.50, output: 10.00, params: 'temperature' },
};

export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const SUPPORTED_MODELS = Object.keys(MODELS);
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

// Throws on a model with no pricing entry instead of silently mispricing it. A job config can
// supply pricing for an unlisted model via overrides (config.pricing -> { model: {input, output} }).
export function pricingFor(model, overrides = {}) {
  const p = overrides[model] || MODELS[model];
  if (!p) {
    throw new Error(
      `Unknown model "${model}" — no pricing entry, refusing to guess (costs and --max-cost would be wrong). ` +
      `Supported: ${SUPPORTED_MODELS.join(', ')}.`
    );
  }
  return p;
}

export function assertKnownModel(model, overrides = {}) { pricingFor(model, overrides); }

// 'reasoning' (reasoning_effort, no temperature) vs 'temperature'. Unlisted-but-priced-via-override
// models default to 'reasoning' — every current OpenAI release is reasoning-style.
export function paramStyleFor(model, overrides = {}) {
  return (overrides[model] || MODELS[model] || {}).params || 'reasoning';
}

// Dollar cost of a single call from its usage object. Cached prompt tokens (automatic prompt
// caching on repeated prefixes) are billed at the cached rate when the model has one; image tokens
// are already included by the API in prompt_tokens, so this needs no image math.
export function costOf(usage, model, overrides = {}) {
  const p = pricingFor(model, overrides);
  const inTok = (usage && usage.prompt_tokens) || 0;
  const cachedTok = Math.min(inTok, (usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0);
  const outTok = (usage && usage.completion_tokens) || 0;
  const cachedRate = p.cached_input != null ? p.cached_input : p.input;
  return ((inTok - cachedTok) * p.input + cachedTok * cachedRate + outTok * p.output) / 1_000_000;
}

// Project the full-run cost from sample results. `sample` = [{ usage }...] (successful calls only).
// `worklistSize` = number of products to be processed. `throughput` = items/min for the time
// estimate (concurrency-dependent, defaulted).
export function projectCost({ sample, worklistSize, model, overrides = {}, throughput = 120 }) {
  const ok = (sample || []).filter((r) => r && r.usage);
  if (ok.length === 0) {
    return { per_item: 0, live: 0, minutes: 0, sample_size: 0, basis: 'no-usage' };
  }
  const totalCost = ok.reduce((s, r) => s + costOf(r.usage, model, overrides), 0);
  const perItem = totalCost / ok.length;
  const live = perItem * worklistSize;
  return {
    per_item: perItem,
    live,
    minutes: Math.ceil(worklistSize / Math.max(1, throughput)),
    sample_size: ok.length,
    worklist_size: worklistSize,
    model,
    basis: 'measured-sample',
  };
}

export function fmtUsd(n) {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
