---
name: meta-context
description: |
  Pull Meta Ads account data for context gathering. Outputs CSV data to context/meta-ads/data/
  and markdown summaries to context/meta-ads/. AUTO-ACTIVATE for: "pull meta ads data", "get meta context",
  "gather meta ads", "refresh meta data", "update meta ads context", "meta performance".
  Also triggered by /meta-context command.
---

# Meta Ads Context Gatherer

Pull Meta Marketing API data and save to `context/meta-ads/` for AI context. Mirrors the structure of gads-context for consistency.

**Output Structure:**
- `context/meta-ads/data/` — Raw CSV data files
- `context/meta-ads/` — Markdown summary files

## Command Format

```
/meta-context [--days N]
```

**Defaults:**
- Days: 30
- Account: From `config/ads-context.config.json → metaAds.adAccountId`

## Process

### Step 1: Load Configuration

Read `config/ads-context.config.json`:
```json
{
  "metaAds": {
    "adAccountId": "act_XXXXXXXXXXXXXXXXX",
    "dateRange": 30,
    "clientName": "Client Name"
  }
}
```

### Step 2: Run Queries

Execute each query using `scripts/query.js`. Run from the client working directory:

```bash
# Structure (no date range)
node .claude/skills/meta-context/scripts/query.js \
  --entity=campaigns \
  --output=context/meta-ads/data/campaigns.csv

node .claude/skills/meta-context/scripts/query.js \
  --entity=adsets \
  --output=context/meta-ads/data/adsets.csv

node .claude/skills/meta-context/scripts/query.js \
  --entity=ads \
  --output=context/meta-ads/data/ads.csv

# Performance insights (require date range)
node .claude/skills/meta-context/scripts/query.js \
  --entity=insights-campaign \
  --days={days} \
  --output=context/meta-ads/data/insights-campaign.csv

node .claude/skills/meta-context/scripts/query.js \
  --entity=insights-adset \
  --days={days} \
  --output=context/meta-ads/data/insights-adset.csv

node .claude/skills/meta-context/scripts/query.js \
  --entity=insights-ad \
  --days={days} \
  --output=context/meta-ads/data/insights-ad.csv
```

**Run all 6 queries.** The script creates output directories automatically.

### Step 3: Load Business Context

Before generating summaries, read the relevant project's `business.md` and extract:
- Primary KPI (leads, purchases, registrations)
- Target CPA / CPL
- Budget constraints

### Step 4: Generate Markdown Summaries

After all CSVs are created, read each and generate summaries using the templates in `references/templates/`.

**Campaigns summary** — JOIN `campaigns.csv` + `insights-campaign.csv` on `id` = `campaign_id`:
- Output: `context/meta-ads/campaigns.md`
- Template: `references/templates/campaigns.md`

**Ad sets summary** — JOIN `adsets.csv` + `insights-adset.csv` on `id` = `adset_id`:
- Output: `context/meta-ads/adsets.md`
- Template: `references/templates/adsets.md`

**Ads summary** — JOIN `ads.csv` + `insights-ad.csv` on `id` = `ad_id`:
- Output: `context/meta-ads/ads.md`
- Template: `references/templates/ads.md`

### Step 5: Present Summary

```markdown
## Meta Ads Context Updated

**Account:** {client_name}
**Date range:** {days} days ({since} → {until})
**Output:** context/meta-ads/

### Files Created

**Data (context/meta-ads/data/):**
| File | Rows | Status |
|------|------|--------|
| campaigns.csv | {n} | OK |
| adsets.csv | {n} | OK |
| ads.csv | {n} | OK |
| insights-campaign.csv | {n} | OK |
| insights-adset.csv | {n} | OK |
| insights-ad.csv | {n} | OK |

**Summaries (context/meta-ads/):**
| File | Status |
|------|--------|
| campaigns.md | OK |
| adsets.md | OK |
| ads.md | OK |

### Quick Insights
- {insight_1}
- {insight_2}
- {insight_3}
```

## Data Notes

**Budgets:** Meta stores budgets in the smallest currency denomination. For CLP (no subdivisions), divide raw values by 100 to get CLP. Cross-check with Ads Manager if uncertain.

**Actions columns:** The script extracts these action types as separate columns:
- `actions_lead` / `cpa_lead` — Lead form completions
- `actions_onsite_conversion_lead_grouped` / `cpa_onsite_conversion_lead_grouped` — Leads (grouped, includes all lead types)
- `actions_landing_page_view` — Landing page views
- `actions_link_click` — Link clicks
- `actions_purchase` / `cpa_purchase` — Purchases

**Spend:** Always in account currency (CLP), not divided.

## Error Handling

**Missing credentials:**
```
Error: Missing credentials in config/.env
Required: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
```
→ Check config/.env has correct values. Token must be from a System User with `ads_read` permission.

**API error 190 (token invalid):**
→ System User token may have been revoked. Regenerate in Business Manager → System Users.

**API error 200 (permission denied):**
→ System User not assigned to this ad account. Add via Business Manager → System Users → Add Assets.

## Bundled Resources

- **scripts/query.js** — Fetch Meta API entities, output CSV with cursor pagination
- **references/templates/campaigns.md** — Campaigns + insights summary template
- **references/templates/adsets.md** — Ad sets + insights summary template
- **references/templates/ads.md** — Ads + creative + insights summary template
