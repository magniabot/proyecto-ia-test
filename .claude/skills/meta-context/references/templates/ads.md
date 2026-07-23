# Meta Ads — Ads & Creatives

**Account:** {client_name}
**Period:** {days} days ({since} → {until})
**Last updated:** {date}

## Summary

| Metric | Value |
|--------|-------|
| Total ads | {total_ads} |
| Active | {active_ads} |
| Paused | {paused_ads} |
| Total spend | {total_spend} CLP |
| Total leads | {total_leads} |
| Best CPL | {best_cpl} CLP |
| Worst CPL | {worst_cpl} CLP |

## Ads Performance

Group by campaign → ad set. For each ad show:

- Ad name
- Status
- Creative: primary text (body), headline (title), CTA type
- Impressions, Reach, Frequency
- Clicks, CTR
- Spend
- Leads
- CPL

Sort by leads descending within each ad set group.

## Top Performers

List the 3 ads with the lowest CPL (minimum 5 leads to qualify):
1. {ad_name} — CPL: {cpl} — Angle: {inferred angle from creative text}
2. ...
3. ...

## Underperformers

List ads with:
- 0 leads + spend > budget threshold
- CPL > 2x account average

## Creative Patterns

Based on top vs bottom performers, note:
- Which message angles appear in top performers
- Which CTA types perform better
- Any pattern in headline style or body length

This section feeds into offer-angles refinement and future creative briefs.

## Notes

- `creative.body` = primary text (the main ad copy)
- `creative.title` = headline
- `creative.call_to_action_type` = CTA button (LEARN_MORE, SIGN_UP, CONTACT_US, etc.)
- If creative fields are empty, the creative may be a video or carousel — check Ads Manager for visual
