# Content — Flow

Phase-by-phase driver for `/feed-optimizer content`. This action does two things in **one LLM call
per product**:

- **Rewrite** `title` / `description` — but **only** when the auditor's weakness detectors flag the
  *existing* value (too short / promo / ALL-CAPS / missing brand / boilerplate / HTML / URL / blank).
  Copy that already passes is left untouched.
- **Backfill** missing `short_title` / `product_highlight` / `product_detail` — authored from facts
  already in the feed.

All authored prose is **grounded in existing evidence** (title + description + image + GPC path +
the populated structured attributes), recombined per a **category-specific formula**. It never
invents facts, never mutates the feed, and outputs an importable supplemental feed plus an **old→new
diff**. See `content-rules.md` for the latitude, prohibited-content, and validation rules.

All steps call `scripts/content.js` with a consistent `--job-id <id>` (job dir
`created/feed-optimizer/jobs/<id>/`). Each command prints a `__RESULTS_JSON__` block.

## Phase C-0 — Gate
```
node .claude/skills/feed-optimizer/scripts/content.js gate
```
Requires (fail-fast): fresh feed-auditor evidence (≤24h), `merchant-products-normalized.json`, and
`OPENAI_API_KEY` in `config/.env` (read only by the worker, never printed). **Soft check:**
`context/google-ads/data/campaigns.csv` — it drives `short_title` scope (only relevant when an active
Demand Gen / Video / Performance Max campaign exists). If it is **absent**, `short_title` is simply
out of scope; offer to run `/gads-context` first to enable it. Its absence is **not** a failure.

## Phase C-1 — Build the worklist + confirm the category mapping
```
node .claude/skills/feed-optimizer/scripts/content.js worklist --job-id <id>
```
Builds the worklist over the **full** product set using the auditor's weakness detectors (rewrite
trigger) and relevance engine (backfill trigger). Prints:
- work counts per field (how many products need each), and
- the **detected category mix** — each product's `gpc_path_en` → a catalog formula
  (Fashion / Electronics / Consumables / Home / Books / Seasonal / Sports / Automotive), with
  anything unmapped falling back to the **Universal** (`general`) formula.

**Confirm the mapping with the user** before sampling: show the category distribution and the formula
each will use. If they want a vertical mapped differently (e.g. "my pet food should read like
consumables: type, weight, flavor, brand"), translate their wording to a `--type-override` and
**re-run worklist** with it:
```
node .claude/skills/feed-optimizer/scripts/content.js worklist --job-id <id> \
  --type-override "animals & pet supplies=consumables_health_beauty; toys & games=general"
```
Each entry is `<GPC top-level vertical>=<catalog_type>`, **;-separated** (verticals can contain
commas). Valid catalog_types: `fashion_apparel`, `electronics`, `consumables_health_beauty`,
`home_furniture`, `books_media`, `seasonal_occasion`, `sports_outdoors`, `automotive`, `general`.
An override beats every auto-detection heuristic; the re-run prints the corrected mix — confirm it
before sampling. (If none of the nine formulas fits what the user wants, keep the mapping and express
the structure via `--steering` in C-2 instead.)
Toggles:
- `--disable title,description` — drop fields from this run.
- `--only short_title,product_highlight` — restrict to specific fields.

If the worklist is empty, explain that no titles/descriptions are weak and nothing relevant is
missing, and stop.

## Phase C-2 — Sample run (re-runnable)
```
node .claude/skills/feed-optimizer/scripts/content.js sample --job-id <id> \
  --sample-size 20 --seed 1 [--model gpt-5.4-mini] [--reasoning-effort low] \
  [--steering "..."] [--disable a,b | --only a,b] [--confidence-floor low|medium|high] \
  [--image-detail auto|low|high]
```
**Model selection happens here, not at launch.** Supported models (priced in
`scripts/lib/llm/cost.js`): `gpt-5.4` / `gpt-5.4-mini` (default) / `gpt-5.4-nano`, plus legacy
`gpt-4o` / `gpt-4o-mini` / `gpt-4.1-mini`. Unknown model ids are rejected (no pricing = no run).
GPT-5.x models take `--reasoning-effort` (`low` default for prose — reasoning tokens bill as output,
so higher effort costs more); legacy models ignore it and run at temperature 0.2. The sampled
model/effort/steering are frozen into the sample — `estimate` and `launch` refuse different
settings, so to switch models re-run `sample`.
Runs a stratified sample synchronously and writes `sample-review.csv` with **`old_value` → `new_value`
side by side**, plus the trigger reason, confidence, status, and evidence.

**Build the HTML review companion and open it.** From the same sample data, author
`sample-review.html` next to the CSV per `reference/shared/review-html.md` (branded, self-contained,
read-only) and `open` it so the user reviews the old→new prose diff in the browser instead of the
CSV. Give prose full-width rows with `white-space:pre-wrap`, and make abstentions/rejected rewrites
stand out. Rebuild + reopen it on every re-run so it tracks the latest seed/steering. The CSV stays
the source of truth; mention its path too. They steer via:
- `--steering "..."` — appended instruction (e.g. "UK spelling", "keep titles under 120 chars",
  "lead with the use case for power tools").
- per-field `--disable` / `--only` toggles.

The product image is sent at `--image-detail auto` by default — the model reads visible attributes
(color, pattern, material/finish) off it as grounded facts. Use `--image-detail high` for more
reliable attribute reading at higher cost (it raises the projected figure at the C-3 gate).

Brand voice is auto-loaded from `context/brand.md` / `context/business.md` when present (phrasing
only — never a source of facts). Re-run with a new `--seed` and adjusted steering until the user is
satisfied; the chosen steering + voice + toggles freeze into the launch config. (Offline testing:
add `--mock`.)

**The sample is the approval gate.** There is no second 40k-row approval — nothing auto-applies. 
So you must show the HTML to the user so they can check the output before going to Phase C-3

## Phase C-3 — Cost gate (mandatory)
```
node .claude/skills/feed-optimizer/scripts/content.js estimate --job-id <id>
```
Projects full-run cost from the sample's **measured** tokens (content runs longer than
small-attributes — descriptions are larger). It refuses to run if the worklist changed since the
sample (fingerprint mismatch) — re-run `sample` first. Present the projected cost + time verbatim
and get explicit approval of that figure via AskUserQuestion.

## Phase C-4 — Launch the background job
```
node .claude/skills/feed-optimizer/scripts/content.js launch --job-id <id> --confirm-cost <usd> \
  [--concurrency 20] [--image-detail auto] [--confidence-floor low] [--max-cost 50] [--port 8788]
```
`--confirm-cost <usd>` is required (the cost gate): pass the exact projected cost the user approved.
Launch re-projects from the current worklist + sample and refuses if the figure is off by more than
10% (stale approval) or if the worklist/model/steering changed since the sample. Model and
reasoning effort come from the sample — there is no `--model` at launch. Spawns a **detached
worker** + **localhost monitor** (default port 8788 so it can run alongside a small-attributes
monitor on 8787). The worker survives this session and re-uses the same crash-proof `results.jsonl`
resume model. `--max-cost` stops dispatching new calls once the ceiling is projected to be
reachable (in-flight calls finish and are recorded).

## Phase C-5 — Monitor / pause / resume
- Monitor UI: progress, running + projected cost, ETA, failures, Pause/Resume.
- Resume after any stop (idempotent, no double-spend):
```
node .claude/skills/feed-optimizer/scripts/content.js resume --job-id <id>
node .claude/skills/feed-optimizer/scripts/content.js status --job-id <id>
```

## Phase C-6 — Outputs
Assembled automatically on completion; manual (re)assemble:
```
node .claude/skills/feed-optimizer/scripts/content.js assemble --job-id <id>
```
Under `created/feed-optimizer/jobs/<id>/output/`:
- `supplemental-<feed_label>.csv` — `id` + changed columns. `title`/`description` are **override**
  columns (the supplemental feed overlays the primary feed by `id` on import); `short_title` is a
  scalar; `product_highlight` / `product_detail` are comma-separated multi-value columns (internal
  commas replaced with `;`).
- `diff.csv` — **old → new** per cell with confidence + evidence. Review this before importing.
- `exceptions.csv` — abstentions, rejected rewrites (validator failures), and call failures.
- `README.md` — write/abstention rates, cost, and import instructions.

Post-run, present write/abstention rates and a **spot-check weighted toward rewrites** (the override
cells are the higher-risk ones). The supplemental feed is **not** applied — the user imports it.

Optionally build `output/diff.html` from `diff.csv` (per `reference/shared/review-html.md`) and `open`
it so the user can eyeball the full old→new change set before importing.

## Run-order checker (recommended, not enforced)
`content` reuses facts from other feed columns. For the richest rewrites, run **`small-attributes`
first** (it fills missing `color` / `size` / `material` / `brand` / …), re-import, re-run
`/feed-auditor`, then run `content` so the title/description recombination has more grounded facts to
work with. `content` still runs standalone — this is an optimization, not a dependency.
