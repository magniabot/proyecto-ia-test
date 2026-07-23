---
name: feed-optimizer
description: >
  Build reviewed feed-fix jobs from fresh feed-auditor evidence and export importable CSVs —
  never mutating Merchant Center or Channable. Deterministic actions handle product type cleanup,
  taxonomy correction, and custom label strategy. The LLM-enrichment action `small-attributes`
  category-aware backfills constrained attributes (color, size, material, gender, dimensions, …)
  by extracting them from product image + title + description via concurrent OpenAI calls; the
  `content` action optimizes weak titles/descriptions and authors missing short_title /
  product_highlight / product_detail. Both run with a re-runnable sample, a cost-confirmation gate,
  and a resumable background job + browser monitor.
disable-model-invocation: true
argument-hint: "[product-type|taxonomy|custom-label|small-attributes|content] [--job-id ID]"
allowed-tools: Bash(node .claude/skills/feed-optimizer/scripts/plan.js *) Bash(node .claude/skills/feed-optimizer/scripts/small-attributes.js *) Bash(node .claude/skills/feed-optimizer/scripts/content.js *) Bash(node .claude/skills/feed-optimizer/scripts/lib/llm/run-job.js *) Bash(mkdir -p .claude/skills/feed-optimizer/tmp) Bash(open created/feed-optimizer/*) Read Write
---

# Feed Optimizer

Downstream skill for feed fixes. It never mutates Merchant Center, Google Ads, feed-management tools, ecommerce platforms, or source feeds — every action produces **importable CSV artifacts** the user applies themselves (e.g. a Channable / Merchant Center supplemental feed).

Two families of action:

- **Deterministic** (`product-type`, `taxonomy`, `custom-label`) — rule-based CSV mapping jobs. No LLM.
- **LLM enrichment** (`small-attributes`, `content`) — category-aware prose/attribute work via concurrent OpenAI calls, gated by a re-runnable sample and an explicit cost confirmation, run as a resumable background job with a browser monitor. Phase 1 routes each action to its flow reference.

`feed-optimizer` depends on a fresh `/feed-auditor` run. It reads the feed audit report, peer-aware handoff notes, the per-module queues, `module-scores.json`, and the cached normalized merchant products. It does not pull data silently.

## Command Routing

```text
/feed-optimizer product-type
/feed-optimizer taxonomy
/feed-optimizer custom-label
/feed-optimizer small-attributes
/feed-optimizer content
/feed-optimizer product-type --job-id product-type-nl
/feed-optimizer custom-label --job-id cl-strategy-q2
```

Supported actions:

- `product-type`
- `taxonomy`
- `custom-label`
- `small-attributes`
- `content`

## Phase 0: Fresh Audit Gate

The `/feed-auditor` emits **per-module** outputs, not a combined queue. Before planning a job, verify the two **required** anchors are present and no older than 24 hours:

- `context/feed/cache/merchant-products-normalized.json` — the normalized product set (every action's worklist)
- `context/analysis/feed/module-scores.json` — proof a fresh audit actually ran

**Fixability-aware inputs (optional, freshness-checked when present).** The auditor stamps each finding with a `fixability_class` and `recommended_downstream`, carried in the per-module queues. Prefer them when steering work:

- `context/analysis/feed/{errors,completeness,attributes,title-desc,images}-queue.csv` — per-module finding queues
- `context/analysis/feed-audit.md` (full run) / `feed-partial-audit.md` (partial) / `feed-{module}-audit.md` (single-module) — the run report, named by run type


```text
/feed-auditor
```

Do not continue with stale data.

**The gate is mechanical for every action — run the matching command, never compare file ages by hand.**

**For the deterministic actions (`product-type`, `taxonomy`, `custom-label`)**, run:

```text
node .claude/skills/feed-optimizer/scripts/plan.js gate
```

It fails fast on missing/stale evidence. Every `plan.js` phase call re-checks freshness internally,
so a stale audit cannot slip through even if this step is skipped.

**For the LLM actions (`small-attributes`, `content`)**, the gate is the same strict freshness check **plus** an `OPENAI_API_KEY` in `config/.env` (Client Env). Run it via the action's script (it fails fast with an actionable message and never prints the key):

```text
node .claude/skills/feed-optimizer/scripts/small-attributes.js gate
node .claude/skills/feed-optimizer/scripts/content.js gate
```

**LLM model + cost contract (both LLM actions).** Supported models and USD/1M-token pricing live in `scripts/lib/llm/cost.js`: `gpt-5.4`, `gpt-5.4-mini` (default), `gpt-5.4-nano`, plus legacy `gpt-4o`, `gpt-4o-mini`, `gpt-4.1-mini`. Unknown model ids are rejected — no pricing entry means no run. The model and `--reasoning-effort` (GPT-5.x only; `none` for small-attributes, `low` for content) are chosen at `sample` time and frozen; `estimate` and `launch` refuse to run with different settings or a worklist that changed since the sample. Launching requires `--confirm-cost <usd>` — the exact projected figure the user explicitly approved (AskUserQuestion) — and the launch re-projects and refuses on >10% drift.

Unlike the deterministic actions, both LLM actions build their worklist from the **full** `merchant-products-normalized.json` (including Merchant-flagged products the auditor's completeness module excludes) — `small-attributes` via the auditor's relevance engine, `content` via the auditor's title/description detectors, both imported at runtime. The auditor queues are used only to enrich tags and steer prioritization. Do not feed a queue CSV (`completeness-queue.csv`, `title-desc-queue.csv`) in as the worklist.


Ask the user which action they want to do.

## Phase 1: Load References And Correct flow

Load only the references needed for the requested action:

### Product Type Flow

- **For `product-type`:** route to `reference/product-type/product-type-flow.md`. This is the primary reference for product type work.

### Taxonomy Flow

- **For `taxonomy`:** route to `reference/taxonomy/taxonomy-flow.md`. Read `reference/taxonomy/taxonomy-rules.md` for rules. This flow corrects `google_product_category` values using Google's official taxonomy. It works in English paths, exports numeric IDs.

### Custom Label Flow

- **For `custom-label`:** route to `reference/custom-label/custom-label-flow.md`. Read `reference/custom-label/custom-label-rules.md` for rules. This flow audits current label state, designs a holistic custom label strategy with the specialist, and creates import CSVs for static labels only. Dynamic/performance labels are routed to the appropriate tool (ProfitMetrics, Channable, ProductHero Labelizer).

### Small Attributes Flow

- **For `small-attributes`:** route to `reference/small-attributes/small-attributes-flow.md` (the phase-by-phase driver) and read `reference/small-attributes/small-attributes-rules.md` for the extraction/abstention/validation rules. 

### Content Flow

- **For `content`:** route to `reference/content/content-flow.md` (the phase-by-phase driver) and read `reference/content/content-rules.md` for the authoring-latitude, prohibited-content, and validation rules. This action rewrites weak `title`/`description` (only when the auditor's detectors flag them) and backfills missing `short_title`/`product_highlight`/`product_detail`, grounded in existing feed facts, output as an importable supplemental feed with an old→new diff.


### HTML Review Companion (all actions)

Every action emits importable CSVs the user reviews. Alongside the CSV, build a **branded, read-only
HTML companion** that makes the old→new diff far easier to scan than a spreadsheet, and **open it
automatically** for the user. The LLM sample reviews (`small-attributes` SA-2, `content` C-2) are the
priority; the deterministic actions' final `diff.csv` get one too. The CSV stays the import source of
truth — the HTML is a convenience layer; never block the flow if building it fails. Author it per
`reference/shared/review-html.md` (self-contained branding + content pointers; structure adapts per
action). Each flow's phases say where.

