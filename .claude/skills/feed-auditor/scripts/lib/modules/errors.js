// Error checker module.
//
// Owns issues Merchant/Google have ALREADY flagged (item-level disapprovals, item issues,
// Shopping product status). Per the error-lane-wins dedup rule, these belong here and NOT to
// Completeness. Most disapprovals need source/site/policy fixes, so the default fixability is
// advisory; only feed-attribute issues that a CSV transform can address route to feed-optimizer.

import { FIXABILITY, makeQueueRow, scoreFromAffected, uniqueProductIds, normText } from './shared.js';

export const id = 'errors';
export const label = 'Error checker';
export const weight = 30;

// Provisional fixability from the Merchant issue text. Claude finalizes per reference/fixability-classes.md.
function classifyError(reason) {
  const text = normText(reason);
  if (/policy|prohibited|counterfeit|misrepresent|adult|dangerous|restricted|trademark|suspend/.test(text)) {
    return { fixability: FIXABILITY.EXTERNAL, actor: 'Policy / account owner', optimizer_action: null };
  }
  if (/landing page|destination|crawl|404|redirect|website|robots|server error|page not found|desktop|mobile.*page/.test(text)) {
    return { fixability: FIXABILITY.EXTERNAL, actor: 'Website / developer', optimizer_action: null };
  }
  if (/price|availability|stock|sale price|microdata|structured data|inconsistent|mismatch/.test(text)) {
    return { fixability: FIXABILITY.EXTERNAL, actor: 'Website / source feed (price & availability)', optimizer_action: null };
  }
  if (/image/.test(text)) {
    return { fixability: FIXABILITY.EXTERNAL, actor: 'Designer / source (imagery)', optimizer_action: null };
  }
  if (/google.?product.?category|product.?type|incorrect category/.test(text)) {
    return { fixability: FIXABILITY.OPTIMIZER_STRATEGY, actor: null, optimizer_action: 'taxonomy' };
  }
  if (/gtin|identifier|mpn|invalid.*brand|missing.*brand/.test(text)) {
    return { fixability: FIXABILITY.SOURCE_REQUIRED, actor: 'Source feed / ecom platform (identifiers)', optimizer_action: null };
  }
  if (/missing.*title|title.*length|title/.test(text)) {
    return { fixability: FIXABILITY.CONTENT_MAKER, actor: null, optimizer_action: null };
  }
  if (/missing.*description|description/.test(text)) {
    return { fixability: FIXABILITY.CONTENT_MAKER, actor: null, optimizer_action: null };
  }
  // Default: Merchant flagged something that needs a human/source look.
  return { fixability: FIXABILITY.EXTERNAL, actor: 'Review Merchant diagnostic (source/site/policy)', optimizer_action: null };
}

export function build({ audit, products }) {
  const rows = audit.evidence.itemEligibilityIssues || [];
  const byProduct = new Map(products.map((product) => [product.product_id, product]));
  const queueRows = [];
  const briefBuckets = new Map();

  for (const row of rows) {
    const product = byProduct.get(row.product_id) || row;
    const { fixability, actor, optimizer_action } = classifyError(row.reason);
    const queueRow = makeQueueRow(product, id, {
      finding: row.reason || row.issue_type,
      attribute: row.issue_type,
      fixability_class: fixability,
      optimizer_action,
      confidence: 'high',
      blocking_reason: row.severity === 'high'
        ? 'Merchant flagged; clear before content or segmentation optimization.'
        : '',
      priority_basis: `severity=${row.severity || 'medium'}`,
    });
    queueRows.push(queueRow);
    if (actor) {
      if (!briefBuckets.has(actor)) briefBuckets.set(actor, []);
      briefBuckets.get(actor).push({ product_id: product.product_id, title: product.title, finding: queueRow.finding });
    }
  }

  const affected = uniqueProductIds(rows);
  const eligible = products.length;
  const briefSections = Array.from(briefBuckets.entries()).map(([actor, sectionRows]) => ({ actor, rows: sectionRows }));

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
    notes: `${affected.size} of ${eligible} product(s) carry a Merchant/Google-flagged issue.`,
  };
}
