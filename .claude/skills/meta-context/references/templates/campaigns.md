# Meta Ads — Campaigns

**Account:** {client_name}
**Period:** {days} days ({since} → {until})
**Last updated:** {date}

## Summary

| Metric | Value |
|--------|-------|
| Total campaigns | {total_campaigns} |
| Active | {active_campaigns} |
| Paused | {paused_campaigns} |
| Total spend | {total_spend} CLP |
| Total impressions | {total_impressions} |
| Total clicks | {total_clicks} |
| Total leads | {total_leads} |
| Avg CPL | {avg_cpl} CLP |
| Avg CTR | {avg_ctr}% |
| Avg CPM | {avg_cpm} CLP |

## Performance vs Target

{If business.md has target CPL:}
- Target CPL: {target_cpl} CLP
- Actual CPL: {actual_cpl} CLP — {above/below/on target}

## Campaigns

For each campaign, show:
- Status (ACTIVE / PAUSED)
- Objective
- Budget (daily or lifetime)
- Impressions, Clicks, CTR
- Spend
- Leads (actions_lead or actions_onsite_conversion_lead_grouped — use whichever is higher)
- CPL (spend / leads)
- Frequency (reach efficiency signal — flag if > 3.0)

Sort by spend descending.

Flag campaigns where:
- CPL is more than 1.5x the target CPL from business.md
- Frequency > 3.0 (audience fatigue risk)
- 0 leads with spend > 0
- Status PAUSED (note if they had recent spend)

## Notes

- Budget values: Meta stores in smallest denomination. For CLP accounts, divide raw budget by 100.
- Leads column: use `actions_lead` or `actions_onsite_conversion_lead_grouped` (whichever is non-zero)
- Frequency > 3.0 typically signals creative fatigue in cold audiences
