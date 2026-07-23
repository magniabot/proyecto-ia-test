// Performance module — DEFERRED.
//
// The performance lane is parked per the feed-auditor-module-redesign plan. The core still
// computes performance-label evidence (hero/sidekick/villain/zombie) which is surfaced here
// for context only. This module is NOT scored and is EXCLUDED from the combined denominator
// until its design + scoring are finalised (open item in the plan). It uses Google Ads shopping
// performance today; Merchant reports.search (product performance / price competitiveness) is
// the future data source.

export const id = 'performance';
export const label = 'Performance';
export const weight = 0;
export const deferred = true;

export function build({ audit }) {
  return {
    id,
    label,
    weight,
    deferred: true,
    applicable: false,
    eligible: 0,
    affected: 0,
    score: null,
    findings: 0,
    queueRows: [],
    briefSections: [],
    performance_label_overview: audit.evidence.performanceLabelOverview || [],
    notes: 'Performance module is deferred and excluded from the combined score. Label overview is provided for context only.',
  };
}
