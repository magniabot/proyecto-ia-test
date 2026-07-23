# Diagnostic Rules — Tracking Completeness (D01-D07)

Read during Phase 1 when running `/tracking-audit completeness` or `/tracking-audit` (default).
Also read `diagnostic-rules-shared.md` first.

## Module Scoring

| ID | Diagnostic | Severity | Pts |
|----|-----------|----------|-----|
| D01 | Conversion Action Coverage | Critical | 15 |
| D02 | Primary/Secondary Classification | Critical | 15 |
| D03 | Duplicate Detection | High | 10 |
| D04 | Naming Consistency | Medium | 5 |
| D05 | Goal Category Accuracy | High | 10 |
| D06 | Counting Method | Critical | 15 |
| D07 | Account-Default Goals | High | 10 |
| **Total** | | | **80** |

---

## D01: Conversion Action Coverage
**Severity:** Critical (15 pts)
**Data:** conversions-audit.csv + business.md

**Check:** Compare conversion actions in the account against expected business events from business.md.

| Vertical | Required macro action(s) |
|----------|------------------------|
| Ecommerce | Purchase (category = PURCHASE) |
| Lead Gen | Form submit / call / booking (category = SUBMIT_LEAD_FORM, CONTACT, BOOK_APPOINTMENT, or CONVERTED_LEAD) |
| SaaS | Signup + trial/payment (category = SIGNUP, CONVERTED_LEAD, or PURCHASE) |

**PASS:** All expected macro conversions exist as ENABLED actions with `metrics.all_conversions > 0`.
**WARN:** Expected macro conversion exists but `metrics.all_conversions = 0` (created but not firing). Or business.md lists offline stages but no UPLOAD_CLICKS actions exist.
**FAIL:** One or more expected macro conversions are missing entirely from the account.

---

## D02: Primary/Secondary Classification
**Severity:** Critical (15 pts)
**Data:** conversions-audit.csv + conversion-goal-config.csv + custom-conversion-goals.csv + campaign-goals.csv

**Check:** Evaluate `conversion_action.primary_for_goal` against action purpose.

**Guardrail — biddable ≠ bidding:** A goal category being biddable for a campaign (`campaign_conversion_goal.biddable = true` in campaign-goals.csv) does NOT mean the campaign optimizes toward it. For account-default campaigns (`goal_config_level = CUSTOMER`), Smart Bidding only optimizes toward a conversion action when BOTH hold: (1) the action's goal category is biddable for the campaign AND (2) the action has `primary_for_goal = true`. A biddable goal containing only secondary actions is inert for bidding — reporting-only, shown as "Secondary" in the UI. Never report "campaign X bids toward action Y" from the biddable flag alone; always join back to `primary_for_goal` in conversions-audit.csv. Exception: campaigns with custom goals (`goal_config_level = CAMPAIGN`) bid on every action in the custom goal regardless of primary/secondary status.

**Campaign-level goal handling:**
Before flagging, check `conversion-goal-config.csv`. If any campaigns have `goal_config_level = CAMPAIGN`:
1. Look up the campaign's `custom_conversion_goal` in `custom-conversion-goals.csv`
2. Check which conversion actions are in that custom goal (via `conversion_actions` field)
3. An action that is secondary at account level but included in a campaign's custom goal is **not a problem** — report as INFO, not WARN/FAIL
4. Only flag if the action is wrong at BOTH account level AND not used in any campaign's custom goal
5. In the details, note which campaigns use custom goals and which conversion actions they target

**PASS:** All macro conversions have `primary_for_goal = true` (or are included in a campaign's custom goal). All micro conversions have `primary_for_goal = false` (unless included in a specific campaign's custom goal for a valid reason).
**WARN:** A micro conversion has `primary_for_goal = true` but appears intentional (e.g., add-to-cart primary for an upper-funnel campaign). Or: account-level classification looks wrong but campaign-level goals compensate — flag for user to confirm the setup is intentional.
**FAIL:** Any of:
- Vanity metric (scroll, time-on-site, bounce, page_view) has `primary_for_goal = true` (it then feeds bidding in every account-default campaign whose matching goal category is biddable)
- Macro conversion has `primary_for_goal = false` AND is NOT included in any campaign's custom goal
- No action has `primary_for_goal = true` at account level AND no campaign-specific goals exist

**Vanity metric detection:** DEFAULT category with names containing "scroll", "time", "session", "bounce", "page_view", "quality_visit".

---

## D03: Duplicate Detection
**Severity:** High (10 pts)
**Data:** conversions-audit.csv

**Check:** Look for multiple ENABLED actions tracking the same event.

Duplicate indicators:
1. Two or more actions with the same `category` AND both `primary_for_goal = true`
2. One WEBPAGE type + one UPLOAD_CLICKS type with the same category, both primary (GACT + GA4 import double-counting)
3. Actions with nearly identical names (e.g., "Purchase" and "purchase" and "BM - GACT - Purchase")

**PASS:** No duplicate primary actions for the same event. Each category has at most one primary action.
**WARN:** Multiple actions in the same category but only one is primary (secondary is a reporting backup — acceptable).
**FAIL:** Two or more primary actions for the same conversion event. This double-counts conversions for Smart Bidding.

**Exception:** UPLOAD_CLICKS actions for different funnel stages in lead gen (e.g., "Qualified Lead" + "Closed Deal") are NOT duplicates — they track different events even if both are CONVERTED_LEAD category.

---

## D04: Naming Consistency
**Severity:** Medium (5 pts)
**Data:** conversions-audit.csv

**Check:** Evaluate `conversion_action.name` against naming patterns from `reference/naming-conventions.md`.

**PASS:** All action names are descriptive and follow a consistent pattern. Names clearly indicate: source type (GACT/OCT/GA4) and event tracked.
**WARN:** Names are descriptive but inconsistent format across actions (mixed conventions).
**FAIL:** Any action uses a default/placeholder name: "Conversion 1", "Untitled", "Website conversion", "test", or single generic word.

**Red flags to check:**
- Default Google Ads names (auto-generated on creation)
- Single words with no context ("leads", "sales")
- Duplicate or near-duplicate names suggesting copy-paste setup

---

## D05: Goal Category Accuracy
**Severity:** High (10 pts)
**Data:** conversions-audit.csv + business.md (vertical)

**Check:** Verify `conversion_action.category` is semantically correct for each action's purpose.

| Event Type | Expected Category |
|------------|------------------|
| Purchase/transaction | PURCHASE |
| Lead form submission | SUBMIT_LEAD_FORM |
| Signup/registration | SIGNUP |
| Phone call | CONTACT |
| Appointment booking | BOOK_APPOINTMENT |
| Offline qualified lead | CONVERTED_LEAD |
| Offline closed deal | CONVERTED_LEAD |

**PASS:** Category matches action purpose for all actions.
**WARN:** Action uses DEFAULT or OTHER category (functional but degrades reporting clarity).
**FAIL:** Category is semantically wrong (e.g., purchase action categorized as CONTACT, lead form as PURCHASE).

**Note:** DEFAULT category is a strong signal of lazy setup. Multiple actions with DEFAULT = systemic issue.

---

## D06: Counting Method
**Severity:** Critical (15 pts)
**Data:** conversions-audit.csv + business.md (vertical)

**Check:** Validate `conversion_action.counting_type` against vertical expectations.

| Vertical | Action type | Expected counting |
|----------|-----------|-------------------|
| Ecommerce | Purchase | MANY_PER_CLICK ("Every") |
| Lead Gen | Form/call/booking | ONE_PER_CLICK ("One") |
| SaaS | Signup/trial start | ONE_PER_CLICK |
| SaaS | Payment/purchase | MANY_PER_CLICK |
| Any | OCT stage (qualified lead, closed deal) | ONE_PER_CLICK |

**PASS:** Counting type matches vertical expectation for all primary actions.
**WARN:** Ambiguous action where either counting could be valid (e.g., SaaS subscription renewals).
**FAIL:** Lead gen form-submit uses MANY_PER_CLICK (inflates conversion counts), or ecommerce purchase uses ONE_PER_CLICK (misses repeat purchases).

**Impact:** This directly controls how Smart Bidding counts conversions. Wrong counting = wrong CPA/ROAS signals.

---

## D07: Account-Default Goals
**Severity:** High (10 pts)
**Data:** conversions-audit.csv + conversion-goal-config.csv + custom-conversion-goals.csv + campaign-goals.csv

**Check:** Evaluate which actions are set as account-level defaults (primary_for_goal = true) and whether this is intentional. Then check campaign-level overrides.

**Guardrail — biddable ≠ bidding (same as D02):** When reporting what account-default campaigns bid toward, do NOT conclude from `campaign_conversion_goal.biddable = true` alone. An action feeds bidding only if its goal category is biddable for the campaign AND the action has `primary_for_goal = true`. A biddable goal category whose actions are all secondary is inert for bidding and must not be reported as a conversion signal the campaign optimizes toward.

**Campaign-level goal handling:**
Check `conversion-goal-config.csv` to identify campaigns that override account defaults:
1. Filter for campaigns with `goal_config_level = CAMPAIGN` — these use custom goals
2. For each, look up the `custom_conversion_goal` in `custom-conversion-goals.csv` to find which conversion actions are included
3. Report account defaults and campaign overrides as two separate layers:
   - **Account-default layer:** which actions are primary account-wide
   - **Campaign override layer:** which campaigns use custom goals, which conversion actions they include, and whether this makes sense
4. A campaign using custom goals that are well-reasoned (e.g., upper-funnel campaign bidding on a different conversion action) should be flagged as INFO, not WARN

**PASS:** Only intended macro conversions are primary at account level. Campaign-specific overrides make strategic sense (e.g., different funnel stages for different campaign types). The set of primary actions makes sense for the business.
**WARN:** Multiple primary actions at account level where only one should be (e.g., both "Form Submit" and "Closed Won" are primary — should be one or the other depending on OCT maturity). Or: campaign-specific goals exist but appear inconsistent (e.g., some campaigns override to micro conversions without clear reason).
**FAIL:** Any of:
- No actions set as primary at account level AND no campaign-specific goals exist (Smart Bidding has no conversion signal)
- Micro/vanity conversions set as primary at account level without campaign-specific goals to justify it
- All actions set as primary indiscriminately at account level

**Cross-reference:** Use `reference/vertical-config-rules.md` Section 4 (Primary/Secondary Rules) and Section 5 (Account-Default vs Campaign-Specific) for vertical-specific expectations.
