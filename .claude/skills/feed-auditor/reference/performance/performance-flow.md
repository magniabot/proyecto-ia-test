# Performance Flow — DEFERRED

The Performance module is parked per the feed-auditor-module-redesign plan. It is **not scored** and is **excluded from the combined denominator**.

## Current state

- The core still computes performance-label evidence (hero/sidekick/villain/zombie) from Google Ads shopping performance. It is surfaced in `module-scores.json` → `modules[performance].performance_label_overview` for **context only**.
- Do not assign a performance score. Do not present labels as a static upload plan.

## When this module is built (open items for the plan)

- **Data source:** add Merchant `reports.accounts.reports.search` (product performance view) alongside Google Ads shopping performance.
- **Scoring:** define how performance re-enters the combined weighting (today the 5 active modules sum to 100). Options to brainstorm: add Performance at a new weight and renormalise, or keep it as an advisory overlay.
- **Confidence:** performance tiers require a fresh `tracking-audit.md`; without it they are directional/limited-confidence, not blocked.
- **Out of scope:** price competitiveness / best-sellers → their own future skill.

Until then, if a user asks for performance prioritisation, run the existing label overview for context and route measurement questions to `/tracking-specialist`.
