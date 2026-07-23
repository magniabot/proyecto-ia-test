# Error Checker Rules

## What counts as an error (already flagged)

From the Merchant API `productStatus.itemLevelIssues` and Google Ads `shopping_product.status`/`issue_codes`:

- Item status not `APPROVED`/`ELIGIBLE` → disapproved/pending/limited.
- Any item-level issue code present.
- Severity: `high` for disapproved/not-eligible; `medium` otherwise.

## Provisional fixability (script-stamped; Claude finalises)

| Issue text contains | Class | Actor / action |
|---|---|---|
| policy, prohibited, counterfeit, misrepresent, trademark, suspend | `external` | Policy / account owner |
| landing page, destination, crawl, 404, redirect, website, server error | `external` | Website / developer |
| price, availability, stock, sale price, microdata, mismatch | `external` | Website / source feed |
| image | `external` | Designer / source |
| google product category, product type, incorrect category | `optimizer:strategy` | `/feed-optimizer` taxonomy |
| gtin, identifier, mpn, invalid/missing brand | `source-required` | Source feed / ecom |
| missing/length title | `content-maker` | `/feed-optimizer` content |
| missing description | `content-maker` | `/feed-optimizer` content |
| (anything else) | `external` | Review Merchant diagnostic |

## Confidence

- High — Merchant/Google flagged it; the existence of the issue is not in doubt. The *fix path* (fixability) is the judgment Claude refines.


