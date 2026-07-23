---
name: meta-ads-copywriter
description: |
  Generate high-converting Meta Ads copy (Headlines, Primary Texts, Descriptions) organized
  by angle into a structured testing matrix. Reads offer-angles.md, brand.md, and business.md
  before writing anything.
  AUTO-ACTIVATE for: "create meta ads copy", "write meta ads", "meta ad copy", "facebook ad copy",
  "instagram ad copy", "write headlines for meta", "primary text for ads", "meta copy matrix",
  "copy testing matrix", "ad copy variants", "paid social copy".
  Also triggered by /meta-ads-copy command.
---

# Meta Ads Copywriter

Generate a coordinated set of Meta Ads copy — Headlines, Primary Texts, and Descriptions — organized by strategic angle into a structured A/B testing matrix. Copy is drawn from the project's existing offer angles, brand context, and business strategy.

## Command Format

```
/meta-ads-copy [--project <name>] [--angle <angle-name>] [--format <format>]
```

**Examples:**
- `/meta-ads-copy` — Interactive mode, asks for project and format
- `/meta-ads-copy --project "Vista los Naranjos"` — Skip project selection
- `/meta-ads-copy --format carousel` — Skip format selection

---

## Process

### Step 1: Prerequisites Check

Check required context files:

| File | Required | If Missing |
|------|----------|------------|
| `context/projects/[project]/offer-angles.md` | Yes | Prompt: "Run `/offer-angles` first" |
| `context/brand.md` | Yes | Prompt: "Run `/ads-context [URL]` first" |
| `context/projects/[project]/business.md` | Recommended | Note gaps, continue |

**If offer-angles.md or brand.md missing, stop and show:**

```
## Prerequisites Missing

| File | Status | Action |
|------|--------|--------|
| context/projects/[project]/offer-angles.md | Missing | Run `/offer-angles` first |
| context/brand.md | Missing | Run `/ads-context [URL]` first |
```

**If business.md missing:** Note it and continue — angles and brand are enough.

---

### Step 2: Project & Format Selection

**2.1 Project selection** (if not provided via flag or already known):

Use AskUserQuestion:
> **Which project is this copy for?**
> 1. Vista los Naranjos
> 2. Naranjos del Elqui

Read the selected project's `context/projects/[project]/offer-angles.md` and `context/projects/[project]/business.md`.

**2.2 Ad format selection:**

Use AskUserQuestion:
> **What Meta ad format is this copy for?**
> 1. Single Image / Video — one headline + primary text + description
> 2. Carousel — multiple cards, each with a headline
> 3. Lead Gen Form — copy optimized for form completion
> 4. Story / Reel — shorter, punchier copy optimized for vertical video

**2.3 Campaign objective:**

Use AskUserQuestion:
> **What is the conversion goal for this campaign?**
> 1. Lead generation (form fill / WhatsApp contact)
> 2. Traffic to landing page
> 3. Video views / Awareness
> 4. Messenger conversation

**2.4 Audience temperature:**

Use AskUserQuestion:
> **What audience temperature is this copy for?**
> 1. Cold — Interest/Lookalike audiences (no prior contact)
> 2. Warm — Engaged with content, visited site, or seen previous ads
> 3. Hot — Retargeting: visited landing page, started form, or lead not yet converted

---

### Step 3: Read Context & Pre-populate

Read from:
- `context/projects/[project]/offer-angles.md` → Extract the 6 angles and their headline-ready phrases
- `context/brand.md` → Extract brand tone, CTAs, differentiators, trust signals
- `context/projects/[project]/business.md` → Extract target audience, conversion mechanism

**Build angle priority based on temperature:**

| Angle | Cold | Warm | Hot |
|-------|------|------|-----|
| Problem/Pain | **LEAD** | Include | Light |
| Value Proposition | Include | **LEAD** | Include |
| USPs | Light | **LEAD** | **LEAD** |
| Value Boosters | Skip | Include | **LEAD** |
| Social Proof | Light | Include | **LEAD** |
| Risk Removal | Skip | Include | **LEAD** |

**Priority meanings:**
- **LEAD** = Primary angle — dedicate at least 2 variants to this
- **Include** = At least 1 variant
- **Light** = Optional, use in descriptions only
- **Skip** = Don't lead with this angle

---

### Step 4: Copy Composition

Generate copy for each of the **LEAD and Include** angles from Step 3. Skip angles marked **Light** or **Skip** unless content is particularly strong.

#### Meta Character Limits (Hard Rules)

| Element | Limit | Note |
|---------|-------|------|
| Headline | 40 chars | Truncated at 27 chars in many placements — front-load the key message |
| Primary Text | 125 chars | Shown before "See more" in feed — hook must land within these chars |
| Description | 30 chars | Often hidden or truncated on mobile — treat as reinforcement only |

**One variant per active angle. LEAD angles get 2 variants.**

#### 4.1 Headlines

For each active angle, write 1 headline (2 for LEAD angles):

- **Must be ≤ 40 characters** (flag anything over 27 as "may truncate")
- Front-load: the first 27 characters should make sense standalone
- Avoid: "revolutionary", "game-changing", "unlock your potential", generic superlatives
- Match brand tone from `context/brand.md`
- Pull specific phrases from `offer-angles.md` headline-ready phrases where possible

Include character count for each headline.

#### 4.2 Primary Texts

For each active angle, write 1 primary text:

**Structure:**
```
[Hook — 1 sentence that earns the next sentence, within first 125 chars]
[Context — 2-3 sentences developing the angle with specifics from offer-angles.md]
[Proof — use actual numbers/facts from brand.md trust signals]
[CTA — matches the campaign objective from Step 2.3]
```

**Rules:**
- First 125 chars must work as a standalone hook (shown before "See more")
- Total length: 150–250 chars for cold traffic, up to 400 chars for warm/hot if building argument
- Pull real data points and specific language from `offer-angles.md` and `brand.md`
- Do not start with the brand name
- Do not use emojis unless `brand.md` explicitly shows the brand uses them
- CTA must match the conversion goal (e.g., "Agenda tu visita" not "Compra ahora" for real estate)

#### 4.3 Descriptions

For each variant, write 1 description:

- **≤ 30 characters**
- Adds one new fact or angle — does not repeat the headline
- Works as a standalone line (may appear without headline in some placements)
- Often a reinforcing micro-claim or CTA

Include character count for each description.

---

### Step 5: Carousel Variants (if format = Carousel)

For carousel format, generate **5 card variants**, each with:
- Card headline (≤ 40 chars)
- Card description (≤ 30 chars)
- Suggested visual concept (1 sentence)

Cards should tell a sequential story OR present 5 independent angles. Ask user:

> **How should carousel cards work?**
> 1. Sequential story — each card advances the argument
> 2. Independent angles — each card is a standalone entry point

---

### Step 6: Combination Suggestions

Suggest 3 specific combinations (headline + primary text + description) for different contexts:

| Set | Optimized For | Combination Logic |
|-----|---------------|-------------------|
| A | Cold traffic / First impression | Lead with Pain or Value Prop |
| B | Warm traffic / Retargeting | Lead with USP or Social Proof |
| C | Hot traffic / Last-mile conversion | Lead with Risk Removal or Scarcity |

For each set, state: which headline, which primary text, which description, and why this combination works.

---

### Step 7: Quality Checklist

Before generating output, verify:

- [ ] Every headline maps to a distinct angle
- [ ] No two primary texts make the same core argument
- [ ] All descriptions work as standalone lines
- [ ] Brand tone is consistent across all pieces (cross-checked against `brand.md`)
- [ ] Specific facts/numbers are used instead of generic adjectives
- [ ] CTAs match the actual conversion goal from Step 2.3
- [ ] First 125 chars of each primary text works as standalone hook
- [ ] Angle priorities match the selected audience temperature
- [ ] LEAD angles have 2 variants each

---

### Step 8: Generate CSV Output

**Read `references/csv-column-reference.md` and use `references/meta-copy-template.csv` as the base.**

Create output at:

```
created/projects/[project]/meta-ads/YYYYMMDD_[project-slug]_meta-copy.csv
```

**Column order (13 columns):**

```
Variante,Angulo,Audiencia,Headline,Chars_Headline,Primary_Text,Hook_125,Chars_Hook,Description,Chars_Description,CTA,Combinacion,Notas
```

**One row per variant.** For LEAD angles with 2 variants, use Variante `1a` and `1b`.

**Combination rows:** After all variants, add 3 summary rows with `Variante` = `SET_A`, `SET_B`, `SET_C`. In `Notas`, explain which variants combine and why.

**Validation before writing:**
- `Chars_Headline` ≤ 40 — hard limit
- `Chars_Hook` ≤ 125 — hook must work standalone
- `Chars_Description` ≤ 30 — hard limit
- Flag any violation in the `Notas` column with `⚠️`

**Filename format:** `YYYYMMDD_[project-slug]_meta-copy.csv`
- Sanitize: lowercase, spaces → hyphens, remove special chars
- Example: `20260321_vista-los-naranjos_meta-copy.csv`

---

### Step 9: Present Summary

After generating the file, show:

```markdown
## Meta Ads Copy Generated

**Project:** [name]
**Format:** [format]
**Audience:** [Cold / Warm / Hot]
**Angles covered:** [X] active angles, [X] total variants
**Output:** created/projects/[project]/meta-ads/[filename].md

### Copy Matrix Overview

| Angle | Priority | Variants | Lead Headline |
|-------|----------|----------|---------------|
| Problem/Pain | LEAD | 2 | "[headline]" |
| Value Prop | Include | 1 | "[headline]" |
| [etc.] | ... | ... | ... |

### Next Steps
1. Review copy in the output file
2. Share with designer alongside brand palette (`context/brand-colours/palette.md`)
3. If running with a Meta brief, use `/meta-brief` to package for the creative team
```

---

### Step 10: Log to Memory

Log to `context/memory/YYYY-MM-DD.md`:

```markdown
## Meta Ads Copy Created
- Project: [name] | Format: [format] | Audience: [temp]
- Angles covered: [list LEAD angles]
- Output: created/projects/[project]/meta-ads/[filename].md
```

---

## Error Handling

| Error | Message |
|-------|---------|
| Missing offer-angles.md | "Run `/offer-angles` first to extract angles for this project" |
| Missing brand.md | "Run `/ads-context [URL]` first to gather brand context" |
| No project specified | "Which project is this for? Vista los Naranjos or Naranjos del Elqui?" |
| Headline > 40 chars | Show warning + auto-shortened version with note |
| Primary text hook > 125 chars | Flag: "First 125 chars may not hook — consider shortening" |
| Description > 30 chars | Show warning + trimmed version |

---

## Integration Points

### Uses (reads from):
- `context/projects/[project]/offer-angles.md` — Source for all 6 angles and headline phrases
- `context/brand.md` — Brand tone, CTAs, trust signals, differentiators
- `context/projects/[project]/business.md` — Audience, conversion mechanism, positioning
- `context/brand-colours/palette.md` — (optional) reference for designer handoff context

### Produces (writes to):
- `created/projects/[project]/meta-ads/YYYYMMDD_[project-slug]_meta-copy.csv` — Copy matrix en CSV (una fila por variante)

### Downstream:
- `/meta-brief` — Package copy + brief for designer handoff
- Landing page (for message match verification)

---

## Output Location

All files are created relative to the **current working directory**:
- Output directory: `created/projects/[project]/meta-ads/`
- Creates directory if it doesn't exist
- Each run creates a new timestamped file (never overwrites)
