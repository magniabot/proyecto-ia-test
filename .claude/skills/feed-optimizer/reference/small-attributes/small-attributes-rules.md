# Small Attributes — Rules

Runtime rules for the `small-attributes` action. The owned attribute set, enum values, and char
limits come from the auditor's `attribute-validation-catalog.json`, imported at runtime (single
source of truth — see `docs/adr/0001`). This file documents the optimizer-only behavior.

## Owned attributes (constrained values)

`color, size, size_system, size_type, gender, age_group, material, pattern, brand,
product_length, product_width, product_height, product_weight, adult (opt-in)`.

Long-form prose (title, description, short_title, product_highlight, product_detail) is **not** owned
here — that is the `content` action.

## Relevance (category-aware, not per-product guessing)

Relevance is decided by the imported auditor engine, per product, from its GPC vertical + market:
- `color` / `size` — apparel **or** any variant product (has color/size/pattern/item_group_id).
- `gender` / `age_group` / `material` / `pattern` / `size_type` — apparel products.
- apparel `gender`/`age_group`/`color`/`size` are Tier-1 only in required markets
  (BR/FR/DE/JP/UK/US), Tier-2 elsewhere — but still attempted.
- `product_length/width/height/weight` — "dimensioned" verticals (furniture, home & garden, large
  hardware, sporting goods, …).
- `brand` — only when missing **and** the account is substantially branded (≥30% share).
- `size_system` — only when `size` is present or being filled.
- `adult` — opt-in only (`--include-adult`); sensitive, default off.

An attribute that is not relevant for a product is **never** attempted. An attribute already present
is **never** overwritten. This is why a non-apparel catalog yields a small worklist — that is
correct, not a bug.

## Inference latitude (per attribute)

- **may-infer-from-image** (`color`, `material`, `pattern`, `gender`, `age_group`) — the model may
  read the product image and obvious context.
- **literal-only** (`size`, `size_system`, `size_type`, `brand`, `adult`, all dimensions/weight) —
  the model may only lift a value **explicitly stated** in the text/image. Dimensions and weight are
  never estimated from the picture; a "55-inch TV" in the title is extractable, an unstated size is
  not.

## Mandatory abstention (no hallucination)

Every value must be backed by evidence in the supplied inputs. With no support, the model returns
`null` and the attribute is left blank, logged, and written to `exceptions.csv` (so the user can send
it to the source feed / advisory follow-up). The prompt enforces this; the worker never fabricates.

## Output validation (catalog re-check)

Every proposed value is re-validated against the catalog before it can enter the supplemental feed:
- enums (`gender`, `age_group`, `size_type`, `size_system`, `adult`) must match allowed values;
- `color` rejects hex codes, allows ≤3 `/`-separated segments (≤40 chars each, ≤100 total);
- `material` allows ≤3 segments; char limits enforced per attribute;
- dimensions must be `number + unit` in allowed units within range;
- low-quality fillers ("n/a", "various", "multicolor", "see image", …) are rejected.

A value that fails validation is treated as an abstention (→ exceptions), so an invalid value is
**never** written into the feed.

## Confidence floor

Each filled cell carries the model's confidence (low/medium/high). `--confidence-floor` demotes
sub-floor values to exceptions. Default `low` (include unless the model itself flags low confidence).

## Image & cost

One call per product, always including the image at `--image-detail low` (tunable to `auto`/`high`).
Missing/broken `image_link` falls back to a text-only call (logged). No product-page scraping in v1.

## Job durability & resume

`results.jsonl` (append-per-item) is the source of truth. Resume = process everything not already in
results — a hard kill mid-item loses at most that item and never double-spends. `--max-cost`
auto-pauses on a cost ceiling. The monitor (localhost only, no secrets) owns Pause/Resume.

## Secrets

`OPENAI_API_KEY` lives in `config/.env` (Client Env). It is read only by the worker, never written to
the job dir, never logged, never shown in the monitor. The Phase 0 gate fails fast if it is absent.

## Output contract

One supplemental-feed CSV **per `feed_label`** (`id` + newly-filled attribute columns only), plus
`diff.csv`, `exceptions.csv`, and `README.md`. Nothing is auto-applied — the user imports the
supplemental feed into Channable / Merchant Center, then re-runs `/feed-auditor` to confirm closure.
