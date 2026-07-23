# Export Formats — Search Term Optimizer

## operations.json schema

```json
{
  "description": "Search term optimizer — 2026-04-17",
  "generated_from": "context/analysis/search-term-audit.md",
  "generated_at": "2026-04-17T10:00:00.000Z",
  "total_operations": 42,
  "operations": [
    {
      "type": "create",
      "resource": "shared_set",
      "fields": {
        "name": "Negative N-grams — Non-Converting",
        "type": "NEGATIVE_KEYWORDS",
        "status": "ENABLED"
      },
      "meta": {
        "action_id": "PREFLIGHT",
        "category": "bootstrap",
        "target": "Negative N-grams — Non-Converting",
        "list_name": "Negative N-grams — Non-Converting",
        "rationale": "List missing; bootstrapping for ST-E02"
      }
    },
    {
      "type": "create",
      "resource": "campaign_shared_set",
      "fields": {
        "campaign": "customers/1234/campaigns/5678",
        "shared_set": "customers/1234/sharedSets/9999",
        "status": "ENABLED"
      },
      "meta": {
        "action_id": "PREFLIGHT",
        "category": "attach",
        "target": "Search — Non-Branded",
        "list_name": "Negative N-grams — Non-Converting",
        "rationale": "Attach shared list to campaign"
      }
    },
    {
      "type": "create",
      "resource": "shared_criterion",
      "fields": {
        "shared_set": "customers/1234/sharedSets/9999",
        "keyword": { "text": "free template", "match_type": "PHRASE" },
        "type": "KEYWORD"
      },
      "meta": {
        "action_id": "ST-E02",
        "category": "ngram",
        "target": "free template",
        "term": "free template",
        "match_type": "PHRASE",
        "scope": "shared_list:Negative N-grams — Non-Converting",
        "rationale": "Non-converting n-gram ($245 spend, 0 conversions, 18 distinct terms)",
        "source_diagnostic": "ST-D13"
      }
    },
    {
      "type": "create",
      "resource": "campaign_criterion",
      "fields": {
        "campaign": "customers/1234/campaigns/5678",
        "negative": true,
        "keyword": { "text": "recipe", "match_type": "EXACT" },
        "type": "KEYWORD"
      },
      "meta": {
        "action_id": "ST-E01",
        "category": "negate",
        "target": "recipe",
        "term": "recipe",
        "match_type": "EXACT",
        "scope": "campaign:Search — Non-Branded",
        "campaign": "Search — Non-Branded",
        "rationale": "Irrelevant ($120 spend, 0 conversions, not in core product taxonomy)",
        "source_diagnostic": "ST-D01"
      }
    },
    {
      "type": "remove",
      "resource": "campaign_criterion",
      "resource_name": "customers/1234/campaignCriteria/5678~11223344",
      "meta": {
        "action_id": "ST-E04",
        "category": "conflict",
        "target": "software",
        "term": "software",
        "scope": "campaign:Search — Non-Branded",
        "rationale": "Blocks active keyword 'project management software'",
        "source_diagnostic": "ST-D08"
      }
    },
    {
      "type": "create",
      "resource": "ad_group_criterion",
      "fields": {
        "ad_group": "customers/1234/adGroups/77777",
        "keyword": { "text": "project planning tool", "match_type": "EXACT" },
        "status": "ENABLED",
        "type": "KEYWORD"
      },
      "meta": {
        "action_id": "ST-E03",
        "category": "promote",
        "target": "project planning tool",
        "term": "project planning tool",
        "match_type": "EXACT",
        "scope": "ad_group:Project Management",
        "campaign": "Search — Non-Branded",
        "ad_group": "Project Management",
        "rationale": "Converting at $65 CPA (target $80); ad group is exact-only",
        "source_diagnostic": "ST-D20"
      }
    }
  ]
}
```

## Required fields by resource type

### `shared_set` (create)
- `fields.name` (string)
- `fields.type` (`"NEGATIVE_KEYWORDS"`)
- `fields.status` (`"ENABLED"`)

### `campaign_shared_set` (create — attach list to campaign)
- `fields.campaign` (campaign resource name)
- `fields.shared_set` (shared set resource name)
- `fields.status` (`"ENABLED"`)

### `shared_criterion` (create — negative on shared list)
- `fields.shared_set` (resource name)
- `fields.keyword.text`, `fields.keyword.match_type` (`"EXACT" | "PHRASE" | "BROAD"`)
- `fields.type` (`"KEYWORD"`)

### `campaign_criterion` (create — campaign-level negative OR brand exclusion)
- `fields.campaign` (resource name)
- `fields.negative` (`true` for negatives)
- `fields.keyword.text`, `fields.keyword.match_type` (for keyword negatives)
- `fields.brand_list` (resource name, for ST-E09 brand exclusion)
- `fields.type` (`"KEYWORD"` or `"BRAND_LIST"`)

### `ad_group_criterion` (create — positive keyword or ad-group-level negative)
- `fields.ad_group` (resource name)
- `fields.keyword.text`, `fields.keyword.match_type`
- `fields.status` (`"ENABLED"` for positive creates)
- `fields.negative` (`true` for ad-group negatives)
- `fields.type` (`"KEYWORD"`)

### Remove operations
- `resource_name` (full resource name — no `fields` key)

### Meta fields (required for CSV sort + review)

Each operation SHOULD carry numeric `meta.cost` (spend during the audit window) and, where relevant, `meta.conversions`. These drive the preview CSV sort order:

| Bucket | Sort key |
|--------|----------|
| `ngrams`, `negate`, `foreign`, `removals`, `brand` | `meta.cost` DESC |
| `promote` | `meta.conversions` DESC |
| `preflight` | natural (shared-set creates before attachments) |

Also emit (where known): `meta.cpa` for promotions, `meta.ad_group` + `meta.campaign` for promotion scoping. Missing values sort to the bottom.

## CSV export formats

`mutate.js` writes one CSV per action category to `created/search-terms/` at **two points**:

1. **Dry-run preview** — filename `{YYYY-MM-DD}_preview_{bucket}.csv`. Written before the user approves so they can scan hundreds of ngram/negate rows in a spreadsheet before committing.
2. **Post-live apply** — filename `{YYYY-MM-DD}_applied_{bucket}.csv`. Written after mutations succeed for rollback/reference.

Buckets: `preflight` (shared-set creates + attachments), `ngrams`, `negate`, `foreign`, `promote`, `removals`, `brand`.

### Format: negate / ngram / foreign (shared list additions)
```
Shared Set,Keyword,Match Type
"Negative Keywords — Irrelevant","recipe","Exact"
"Negative N-grams — Non-Converting","free template","Phrase"
```

### Format: campaign-level negatives
```
Campaign,Keyword,Match Type
"Search — Non-Branded","recipe","Exact"
```

### Format: promote (ST-E03)
```
Campaign,Ad Group,Keyword,Match Type,Status
"Search — Non-Branded","Project Management","project planning tool","Exact","Enabled"
```

### Format: removals (ST-E04, E05, E06)
```
Scope,Target,Term,Match Type,Rationale
"campaign","Search — Non-Branded","software","Phrase","Blocks active keyword"
```

## Changelog format

Appended to `context/analysis/search-term-changelog.md`:

```markdown
## 2026-04-17 — Search Term Optimizer

**Mode:** live | **Account:** 1234567890
**Result:** 42/42 applied
**Source:** context/analysis/search-term-audit.md

**Summary:** 2 × PREFLIGHT, 18 × ST-E01, 12 × ST-E02, 5 × ST-E03, 3 × ST-E04, 2 × ST-E05

| # | Action | Type | Target | Status |
|---|--------|------|--------|--------|
| 1 | PREFLIGHT | create | Negative N-grams — Non-Converting | OK |
| 2 | PREFLIGHT | create | Search — Non-Branded | OK |
| 3 | ST-E01 | create | recipe | OK |
...
```
