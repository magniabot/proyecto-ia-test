# Meta Ads — Ad Sets

**Account:** {client_name}
**Period:** {days} days ({since} → {until})
**Last updated:** {date}

## Summary

| Metric | Value |
|--------|-------|
| Total ad sets | {total_adsets} |
| Active | {active_adsets} |
| Paused | {paused_adsets} |
| Total spend | {total_spend} CLP |
| Total leads | {total_leads} |
| Avg CPL | {avg_cpl} CLP |

## Ad Sets by Campaign

Group by campaign name. For each ad set show:

- Status
- Optimization goal
- Budget (daily or lifetime)
- Targeting summary (age range, genders, placements, geo if available)
- Impressions, Reach, Frequency
- Clicks, CTR
- Spend
- Leads
- CPL

Sort within each campaign group by spend descending.

Flag ad sets where:
- CPL > 1.5x target CPL
- Frequency > 3.5 (creative fatigue)
- 0 leads with significant spend (> 20% of campaign budget)
- Optimization goal mismatch with campaign objective

## Audience Notes

For each ad set, summarize targeting in human-readable form:
- Age: {min}-{max}
- Gender: All / Men / Women
- Placements: Facebook Feed, Instagram Feed, Stories, etc.
- Geography: if available from targeting.geo_locations

## Notes

- Frequency benchmarks: < 2.0 = healthy, 2.0-3.5 = monitor, > 3.5 = refresh creative
- For OUTCOME_LEADS campaigns, expected optimization_goal = LEAD_GENERATION or OFFSITE_CONVERSIONS
