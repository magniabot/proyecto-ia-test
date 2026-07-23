// Images module.
//
// Image coverage + Merchant image diagnostics, plus optional URL-level technical evidence
// from the image probe (scripts/probe-images.js). Nothing downstream can regenerate an image
// from a CSV, so image findings are EXTERNAL fixability -> advisory brief for a designer/
// source, never a skill handoff. Coverage/Merchant checks are metadata-only. When the probe
// cache is present, we add real Tier-1 technical findings (broken link, undersized, oversized)
// fetched from the live image_link. Visual composition is asserted ONLY by Claude's Tier-2
// pass over the sampled top-N images, never inferred here.

import { existsSync } from 'fs';
import { FIXABILITY, makeQueueRow, scoreFromAffected, normText } from './shared.js';
import { loadJson, outputPaths } from '../feed-auditor-core.js';

export const id = 'images';
export const label = 'Images';
export const weight = 10;

export function build({ audit, products, projectRoot }) {
  const byProduct = new Map(products.map((product) => [product.product_id, product]));
  const queueRows = [];
  const briefRows = [];
  const affected = new Set();

  // 1. Coverage issues from core (missing image_link, no additional images).
  for (const row of audit.evidence.imageIssues || []) {
    const product = byProduct.get(row.product_id) || row;
    const severity = !product.image_link ? 'high' : 'low';
    const queueRow = makeQueueRow(product, id, {
      finding: row.reason,
      attribute: 'image_link',
      fixability_class: FIXABILITY.EXTERNAL,
      confidence: 'high',
      blocking_reason: !product.image_link ? 'A missing primary image blocks the product from serving.' : '',
      priority_basis: `severity=${severity}`,
    });
    queueRows.push(queueRow);
    briefRows.push({ product_id: product.product_id, title: product.title, finding: row.reason });
    affected.add(row.product_id);
  }

  // 2. Merchant-flagged image issues from item-level issue codes (deeper than coverage).
  for (const product of products) {
    if (/image/.test(normText(product.issue_codes))) {
      if (affected.has(product.product_id)) continue;
      const queueRow = makeQueueRow(product, id, {
        finding: `Merchant flagged an image issue: ${product.issue_codes}`,
        attribute: 'image_link',
        fixability_class: FIXABILITY.EXTERNAL,
        confidence: 'high',
        priority_basis: 'merchant_image_issue',
      });
      queueRows.push(queueRow);
      briefRows.push({ product_id: product.product_id, title: product.title, finding: queueRow.finding });
      affected.add(product.product_id);
    }
  }

  // 3. Tier-1 technical probe findings (optional). When scripts/probe-images.js has run, fold
  //    real URL-level evidence (broken link, undersized, oversized) into the queue + score.
  //    Graceful: absent probe cache -> metadata-only behavior, identical to before.
  let probeSummary = null;
  const probePath = projectRoot ? outputPaths(projectRoot).imageProbeJson : null;
  if (probePath && existsSync(probePath)) {
    const probe = loadJson(probePath, 'image-probe-read');
    probeSummary = { probed: probe.probed || 0, flagged: probe.flagged || 0 };
    for (const result of probe.results || []) {
      if (!result.findings || result.findings.length === 0) continue;
      const product = byProduct.get(result.product_id) || result;
      // Highest-severity finding leads; list the rest in the message.
      const order = { high: 0, medium: 1, low: 2 };
      const sorted = [...result.findings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
      const lead = sorted[0];
      const detail = sorted.map((f) => f.message).join('; ');
      const queueRow = makeQueueRow(product, id, {
        finding: `Image probe: ${detail}`,
        attribute: 'image_link',
        fixability_class: FIXABILITY.EXTERNAL,
        confidence: 'high',
        severity: lead.severity,
        blocking_reason: sorted.some((f) => ['broken_image_url', 'not_an_image', 'below_minimum_size', 'file_too_large', 'too_many_megapixels'].includes(f.code))
          ? 'Image is broken or violates a Google image requirement and will be disapproved.' : '',
        priority_basis: `image_probe:${lead.code}`,
      });
      queueRows.push(queueRow);
      briefRows.push({ product_id: product.product_id, title: product.title, finding: `${detail}${result.image_link ? ` (${result.image_link})` : ''}` });
      affected.add(result.product_id);
    }
  }

  const eligible = products.length;
  const probeNote = probeSummary
    ? ` Image probe ran (${probeSummary.flagged}/${probeSummary.probed} primary images flagged on a live URL fetch).`
    : ' Image probe not run (metadata-only; run scripts/probe-images.js for dimension/broken-link/oversize checks).';
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
    briefSections: briefRows.length ? [{ actor: 'Designer / source (imagery)', rows: briefRows, note: 'Coverage/Merchant findings are metadata-only; image-probe findings are live URL facts. Visual composition is only asserted from Claude\'s Tier-2 sampled review.' }] : [],
    notes: `${affected.size} of ${eligible} product(s) have an image coverage, Merchant, or probe issue.${probeNote}`,
  };
}
