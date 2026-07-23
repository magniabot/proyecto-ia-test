# Feed Auditor - Report Template

Write the report to `context/analysis/feed-audit.md` (full run), `context/analysis/feed-{module}-audit.md` (single module), or `context/analysis/feed-partial-audit.md` (partial multi-module run). Append the audit log at `context/analysis/feed-audit-log.md` after successful runs only. Account-health hard blocks write no report or log.

The report is an operator decision brief first and a diagnostic scorecard second. Cluster-level in Markdown; product-level detail stays in the queue CSVs.

## Full-run report

```markdown
# Feed Audit - {date}

**Combined score:** {combined}/100 ({band})  (Performance deferred — excluded)
**Account-health gate:** {pass | block | degraded | unknown}
**Run by:** /feed-auditor (full) at {timestamp}
**Module scores:** context/analysis/feed/module-scores.json

## Executive read

Two to four short paragraphs (<250 words): what matters this week, what to do first, what not to change, how peer reports / account-health affect confidence. Do not dump row counts first.

## Diagnosis

One paragraph: "The problem is at the {module} layer — {root cause}."

## Top hypothesis

- **Module:** {account-health | errors | completeness | attributes | title-desc | images}
- **Name:** {hypothesis}
- **Confidence:** {low | medium | high}
- **Evidence:** {brief}

## Module scorecard

| Module | Score | Band | Findings | Top fixability | Handoff |
|---|---:|---|---:|---|---|
| Errors | {x}/100 | {band} | {n} | {class} | {downstream} |
| Completeness | {x}/100 | {band} | {n} | {class} | {downstream} |
| Attributes | {x}/100 | {band} | {n} | {class} | {downstream} |
| Title & Description | {x}/100 | {band} | {n} | content-maker | /feed-optimizer content |
| Images | {x}/100 | {band} | {n} | external | advisory brief |
| Performance | deferred | — | — | — | — |

## Per-module read

For each module that ran: 2-4 sentences naming the issue, the fixability split (how many `optimizer:*` vs `content-maker` vs `source-required`/`external`), and the one-line handoff. Reference the queue CSV and advisory brief.

## Account-health

Homepage claim, account issues, business-info completeness, aggregate disapproval roll-up. Note blockers and limited-confidence.

## Do not change

Boundaries: image visual quality is metadata-only; price competitiveness is out of scope (future skill); deferred performance labels are not a static upload plan.

## Handoffs

Ordered sequence using `reference/handoff-matrix.md` — fixability-driven, cascade-ordered.

## Evidence files

Per-module queues, advisory briefs, module-scores.json. For Title & Description, include `title-desc-clusters.json` and `title-desc-brief.md`.
```

## Single-module report

Same shape, scoped to one module: headline = that module's score; replace the scorecard with the single module; keep Executive read, the per-module read, account-health gate, handoff, evidence. Do not imply full feed coverage.

## Partial multi-module report

Write to `context/analysis/feed-partial-audit.md`.

Same shape as the full report, but scoped to selected modules only:

- Header says `Run: partial` and `Modules run: {list}`.
- State `Full coverage: no`.
- State `Combined full score: not calculated`.
- If using `scoped_score`, label it `Scoped selected-module score`; never present it as the feed audit score.
- Include only selected modules in the scorecard, ordered by the cascade.
- Mention unselected higher layers only when that caveat changes confidence or sequencing.

## Audit log entry

Append:

```markdown
## {date} - {run: full | single | partial} - Score: {combined_or_scoped_score}/100 ({band})
- Modules run: {list}
- Account-health gate: {gate}
- Top hypothesis: {module} - {name}
- Module scores: errors={x} completeness={x} attributes={x} title-desc={x} images={x}
- Top handoff: {one-line}
```
