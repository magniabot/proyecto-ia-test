// Shared contract for the feed-auditor module layer.
//
// This layer sits ON TOP of the tested evidence builders in feed-auditor-core.js.
// Core detects raw evidence; each module here re-groups that evidence into a scored,
// routable module: a 0-100 score, a per-module queue (the downstream contract), and an
// advisory brief for findings no skill can auto-fix. Claude owns final judgment from
// reference/; these are mechanical inputs only.

// The 5 fixability classes. See reference/fixability-classes.md for the authoritative spec.
export const FIXABILITY = {
  OPTIMIZER_DERIVABLE: 'optimizer:derivable', // value computable from data already in the feed
  OPTIMIZER_STRATEGY: 'optimizer:strategy',   // CSV-doable, needs a specialist decision first
  CONTENT_MAKER: 'content-maker',             // free-text generation (title/description)
  SOURCE_REQUIRED: 'source-required',         // value exists nowhere in feed -> source/Channable/ecom
  EXTERNAL: 'external',                        // image reshoot, price/site mismatch, policy fix
};

// The actions /feed-optimizer actually dispatches (its SKILL.md routing table). The
// recommended_downstream tokens emitted here form the machine contract between the two
// skills: every token must be `feed-optimizer:<one of these>` or `advisory-brief`.
export const OPTIMIZER_ACTIONS = ['product-type', 'taxonomy', 'custom-label', 'small-attributes', 'content'];

export const VALID_DOWNSTREAM = new Set([
  ...OPTIMIZER_ACTIONS.map((action) => `feed-optimizer:${action}`),
  'advisory-brief',
]);

// Per-attribute findings are all served by the single `small-attributes` LLM action —
// there are no per-attribute optimizer actions. Normalise legacy tokens here so the
// emitted route always lands on a real action.
const SMALL_ATTRIBUTE_ACTIONS = new Set([
  'gender', 'age-group', 'color', 'material', 'size',
  'size-system', 'size-type', 'pattern', 'condition', 'brand', 'dimensions',
]);

function canonicalOptimizerAction(action) {
  if (!action) return null;
  return SMALL_ATTRIBUTE_ACTIONS.has(action) ? 'small-attributes' : action;
}

// fixability_class -> recommended_downstream token used in the queue + handoff sequencing.
export function routeFor(fixability, optimizerAction = null) {
  switch (fixability) {
    case FIXABILITY.OPTIMIZER_DERIVABLE:
    case FIXABILITY.OPTIMIZER_STRATEGY: {
      const action = canonicalOptimizerAction(optimizerAction);
      // Constrained-attribute work without an explicit action is small-attributes territory;
      // never emit a bare `feed-optimizer` token no action answers to.
      return `feed-optimizer:${action && OPTIMIZER_ACTIONS.includes(action) ? action : 'small-attributes'}`;
    }
    case FIXABILITY.CONTENT_MAKER:
      return 'feed-optimizer:content';
    case FIXABILITY.SOURCE_REQUIRED:
    case FIXABILITY.EXTERNAL:
    default:
      return 'advisory-brief';
  }
}

export function isAdvisory(fixability) {
  return fixability === FIXABILITY.SOURCE_REQUIRED || fixability === FIXABILITY.EXTERNAL;
}

// Canonical per-module queue schema (the downstream contract feed-optimizer reads).
export const MODULE_QUEUE_HEADERS = [
  'product_id',
  'title',
  'feed_label',
  'target_country',
  'language',
  'module',
  'finding',
  'attribute',
  'fixability_class',
  'recommended_downstream',
  'confidence',
  'severity',
  'tier',
  'blocking_reason',
  'priority_basis',
];

export function makeQueueRow(product, moduleId, fields) {
  const fixability = fields.fixability_class || FIXABILITY.SOURCE_REQUIRED;
  // Contract guard: never emit a downstream token the optimizer doesn't dispatch.
  const requestedRoute = fields.recommended_downstream;
  const route = requestedRoute && VALID_DOWNSTREAM.has(requestedRoute)
    ? requestedRoute
    : routeFor(fixability, fields.optimizer_action);
  return {
    product_id: product.product_id || '',
    title: product.title || '',
    feed_label: product.feed_label || '',
    target_country: product.target_country || '',
    language: product.language || '',
    module: moduleId,
    finding: fields.finding || '',
    attribute: fields.attribute || '',
    fixability_class: fixability,
    recommended_downstream: route,
    confidence: fields.confidence || 'medium',
    severity: fields.severity || '',
    tier: fields.tier === undefined || fields.tier === null ? '' : String(fields.tier),
    blocking_reason: fields.blocking_reason || '',
    priority_basis: fields.priority_basis || '',
  };
}

// Mechanical per-module score. Account-relative: the denominator is the count of products
// for which the module is RELEVANT (eligible), not the whole catalog. When nothing is
// eligible the module is not applicable and returns null (excluded from the combined score).
export function scoreFromAffected(affectedProductIds, eligibleProductCount) {
  if (!eligibleProductCount || eligibleProductCount <= 0) return null;
  const affected = affectedProductIds instanceof Set ? affectedProductIds.size : affectedProductIds;
  const clean = Math.max(0, Math.min(affected, eligibleProductCount));
  return Math.round(100 * (1 - clean / eligibleProductCount));
}

export function statusBand(score) {
  if (score === null || score === undefined) return 'not-applicable';
  if (score >= 90) return 'strong';
  if (score >= 70) return 'watch';
  if (score >= 50) return 'weak';
  return 'blocked';
}

// Advisory brief: human-actionable markdown for source-required / external findings,
// grouped by the actor that must act. Explicitly NOT a skill route.
export function renderAdvisoryBrief(moduleLabel, generatedDate, sections) {
  const lines = [
    `# ${moduleLabel} - Advisory Brief (${generatedDate})`,
    '',
    'These findings cannot be fixed by a PPCOS skill. They need a human/source action.',
    'This is not a skill handoff.',
    '',
  ];
  const nonEmpty = sections.filter((section) => section.rows.length > 0);
  if (nonEmpty.length === 0) {
    lines.push('_No advisory (source-required / external) findings for this module._', '');
    return `${lines.join('\n')}\n`;
  }
  for (const section of nonEmpty) {
    lines.push(`## ${section.actor} (${section.rows.length} product(s))`, '');
    if (section.note) lines.push(section.note, '');
    for (const row of section.rows.slice(0, 25)) {
      lines.push(`- \`${row.product_id}\` ${row.finding}${row.title ? ` — ${row.title.slice(0, 80)}` : ''}`);
    }
    if (section.rows.length > 25) {
      lines.push(`- … and ${section.rows.length - 25} more (see the module queue CSV).`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

// Shared text helpers (kept independent of core internals).
export function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function tokens(value) {
  return normText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

export function uniqueProductIds(rows) {
  return new Set(rows.map((row) => row.product_id).filter(Boolean));
}
