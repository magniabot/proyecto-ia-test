# Small Attributes — Flow

Phase-by-phase driver for `/feed-optimizer small-attributes`. This action backfills **constrained,
catalog-validatable** product attributes (color, size, material, pattern, gender, age_group,
size_type, size_system, brand, product dimensions/weight, and opt-in `adult`) by **extracting** them
from existing evidence (product image + title + description + GPC category) via batched OpenAI calls.
It never invents values, never mutates the feed, and outputs an importable supplemental feed.

All steps call `scripts/small-attributes.js`. Pass `--job-id <id>` consistently so every phase reads
the same job dir (`created/feed-optimizer/jobs/<id>/`). Each command prints a `__RESULTS_JSON__`
block for structured capture.

## Phase SA-0 — Gate
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js gate
```
Requires: fresh feed-auditor evidence (≤24h), `merchant-products-normalized.json`, and
`OPENAI_API_KEY` in `config/.env`. If it fails, route to `/feed-auditor` or ask the user to set the
key — do not proceed. The key is read only by the worker and never printed.

## Phase SA-1 — Build the worklist
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js worklist --job-id <id>
```
Builds the category-aware worklist over the **full** product set (including Merchant-flagged
products) using the auditor's relevance engine. Prints, per owned attribute, how many products are
**relevant AND missing** it. Present this distribution to the user. Flags:
- `--disable color,size` — drop attributes from this run.
- `--only color,material` — restrict to specific attributes.
- `--include-adult` — opt into the sensitive `adult` flag (off by default; balloons the worklist).

If the worklist is empty, explain that no products have relevant missing attributes for this
catalog's categories/markets, and stop.

## Phase SA-2 — Sample run (re-runnable)
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js sample --job-id <id> \
  --sample-size 20 --seed 1 [--model gpt-5.4-mini] [--reasoning-effort none] \
  [--steering "..."] [--disable a,b | --only a,b] [--confidence-floor low|medium|high]
```
**Model selection happens here, not at launch.** Supported models (priced in
`scripts/lib/llm/cost.js`): `gpt-5.4` / `gpt-5.4-mini` (default) / `gpt-5.4-nano`, plus legacy
`gpt-4o` / `gpt-4o-mini` / `gpt-4.1-mini`. Unknown model ids are rejected (no pricing = no run).
GPT-5.x models take `--reasoning-effort` (`none` default for extraction — reasoning tokens bill as
output, so higher effort costs more); legacy models ignore it and run at temperature 0. The sampled
model/effort/steering are frozen into the sample — `estimate` and `launch` refuse to run with
different settings, so to switch models re-run `sample`.
Runs a stratified-by-vertical sample synchronously and writes `sample-review.csv` (one row per
attribute cell: proposed value, confidence, status FILLED/abstained/invalid, evidence).

**Build the HTML review companion and open it.** From the same sample data, author
`sample-review.html` next to the CSV per `reference/shared/review-html.md` (branded, self-contained,
read-only) and `open` it so the user reviews in the browser. A dense per-product attribute-cell grid
reads best here; use the status/confidence badges and let abstentions/invalids stand out. Rebuild +
reopen on every re-run so it tracks the latest seed/steering/toggles. The CSV stays the source of
truth; mention its path too. They steer via:
- `--steering "..."` — free-text instruction appended to the prompt (e.g. "UK spelling",
  "don't guess gender for unisex-looking items").
- per-attribute `--disable` / `--only` toggles.
Re-run with a new `--seed` and adjusted steering/toggles until the user is satisfied. The chosen
steering + toggles carry into the launch config. (For offline testing, add `--mock`.)

## Phase SA-3 — Cost gate (mandatory)
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js estimate --job-id <id>
```
Projects the full-run cost from the sample's **measured** token usage. It refuses to run if the
worklist changed since the sample (fingerprint mismatch) — re-run `sample` first. Present the
projected cost + time estimate to the user verbatim and get explicit approval of that figure via
AskUserQuestion. Never launch without it.

## Phase SA-4 — Launch the background job
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js launch --job-id <id> --confirm-cost <usd> \
  [--concurrency 20] [--image-detail low] [--confidence-floor low] [--max-cost 50] [--port 8787]
```
`--confirm-cost <usd>` is required (the cost gate): pass the exact projected cost the user approved.
Launch re-projects from the current worklist + sample and refuses if the figure is off by more than
10% (stale approval) or if the worklist/model/steering changed since the sample. Model and
reasoning effort come from the sample — there is no `--model` at launch. Spawns a **detached
worker** + a **localhost monitor** (open the printed `http://127.0.0.1:<port>` URL). The worker
survives this session. `--max-cost` stops dispatching new calls once the ceiling is projected to be
reachable (in-flight calls finish and are recorded). `--no-monitor` skips the UI.

## Phase SA-5 — Monitor / pause / resume
- Monitor UI shows progress, running + projected cost, ETA, failures, and Pause/Resume.
- Resume after any stop (crash, pause, machine sleep) — idempotent, no double-spend:
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js resume --job-id <id>
```
- Check status from the CLI:
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js status --job-id <id>
```

## Phase SA-6 — Outputs
The worker assembles outputs automatically on completion; to (re)assemble manually:
```
node .claude/skills/feed-optimizer/scripts/small-attributes.js assemble --job-id <id>
```
Produces, under `created/feed-optimizer/jobs/<id>/output/`:
- `supplemental-<feed_label>.csv` — one per feed_label: `id` + newly-filled attribute columns.
- `diff.csv` — old→new per cell with confidence + evidence.
- `exceptions.csv` — abstentions, rejected values, and failures (route these to source/advisory).
- `README.md` — fill/abstention rates, cost, and import instructions.

Post-run, present the fill rates + abstention rates and a short spot-check of the supplemental CSV.
The supplemental feed is **not** applied — the user imports it into Channable / Merchant Center.

Optionally build `output/diff.html` from `diff.csv` (per `reference/shared/review-html.md`) and `open`
it so the user can eyeball the full old→new change set before importing.
