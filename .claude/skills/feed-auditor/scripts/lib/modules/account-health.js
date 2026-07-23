// Account-health pre-check gate (NOT a scored module).
//
// Interprets the read-only account-level Merchant resources pulled by pull-data.js
// (accounts.issues, homepage, businessInfo, aggregateProductStatuses, programs,
// automaticImprovements, gbpAccounts, shippingSettings). Runs on every invocation. Hard
// blockers (unclaimed homepage, CRITICAL/suspended account issues) gate the audit and route
// to /merchant-auth. Non-blocking issues become notes that feed the Error module narrative.
// Degrades gracefully when endpoints are unavailable (version/region/perm).

function resource(accountHealth, key) {
  return accountHealth?.resources?.[key] || null;
}

function firstArray(payload, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function interpretAccountHealth(accountHealth, products = []) {
  if (!accountHealth || !accountHealth.resources) {
    return {
      gate: 'unknown',
      available: 0,
      total: 0,
      blockers: [],
      notes: ['No account-health data was pulled. Run /feed-auditor pull or pass --refresh.'],
      summary: {},
    };
  }

  const blockers = [];
  const notes = [];
  const summary = {};
  const total = Object.keys(accountHealth.resources).length;
  const available = Object.values(accountHealth.resources).filter((r) => r.ok).length;

  // Homepage claim
  const homepage = resource(accountHealth, 'homepage');
  if (homepage?.ok) {
    const claimed = homepage.payload?.claimed;
    summary.homepage_claimed = claimed === undefined ? 'unknown' : claimed;
    summary.homepage_uri = homepage.payload?.uri || homepage.payload?.homepageUri || '';
    if (claimed === false) {
      blockers.push('Website/homepage is not claimed in Merchant Center. Products cannot serve until claimed.');
    }
  } else if (homepage) {
    notes.push(`Homepage status unavailable (${homepage.label}: ${homepage.status || 'error'}).`);
  }

  // Account-level issues
  const accountIssues = resource(accountHealth, 'account_issues');
  if (accountIssues?.ok) {
    const issues = firstArray(accountIssues.payload, 'accountIssues', 'issues');
    const critical = issues.filter((issue) => /CRITICAL|SUSPEND|DISAPPROV/i.test(issue.severity || issue.impact || ''));
    summary.account_issue_count = issues.length;
    summary.account_critical_count = critical.length;
    for (const issue of critical) {
      blockers.push(`Account-level issue: ${issue.title || issue.name || 'critical issue'}.`);
    }
    for (const issue of issues.filter((issue) => !critical.includes(issue)).slice(0, 10)) {
      notes.push(`Account issue: ${issue.title || issue.name || 'issue'} (${issue.severity || 'severity n/a'}).`);
    }
  } else if (accountIssues) {
    notes.push(`Account issues unavailable (${accountIssues.label}: ${accountIssues.status || 'error'}).`);
  }

  // Business info completeness
  const businessInfo = resource(accountHealth, 'business_info');
  if (businessInfo?.ok) {
    const payload = businessInfo.payload || {};
    const hasAddress = Boolean(payload.address || payload.businessAddress);
    const hasPhone = Boolean(payload.phone || payload.phoneNumber);
    summary.business_info = { has_address: hasAddress, has_phone: hasPhone };
    if (!hasAddress) notes.push('Business info is missing a business address (affects trust/store quality).');
  } else if (businessInfo) {
    notes.push(`Business info unavailable (${businessInfo.label}: ${businessInfo.status || 'error'}).`);
  }

  // Aggregate product statuses (disapproval roll-up; cross-check for the Error module)
  const aggregate = resource(accountHealth, 'aggregate_product_statuses');
  if (aggregate?.ok) {
    const rows = firstArray(aggregate.payload, 'aggregateProductStatuses');
    let disapproved = 0;
    let active = 0;
    let pending = 0;
    for (const row of rows) {
      const stats = row.stats || row.itemLevelIssues || {};
      disapproved += Number(stats.disapprovedCount || stats.disapproved || 0);
      active += Number(stats.activeCount || stats.active || 0);
      pending += Number(stats.pendingCount || stats.pending || 0);
    }
    summary.aggregate_product_statuses = { active, pending, disapproved, destinations: rows.length };
    if (disapproved > 0) {
      notes.push(`Merchant aggregate roll-up reports ${disapproved} disapproved product instance(s) — cross-check the Error module.`);
    }
  } else if (aggregate) {
    notes.push(`Aggregate product statuses unavailable (${aggregate.label}: ${aggregate.status || 'error'}).`);
  }

  // Programs (shopping-ads / free-listings / product-ratings / etc.): serving-readiness overview.
  const programs = resource(accountHealth, 'programs');
  if (programs?.ok) {
    const rows = firstArray(programs.payload, 'programs');
    const byProgram = {};
    for (const row of rows) {
      const id = String(row.name || '').split('/').pop() || row.program || 'program';
      byProgram[id] = {
        state: row.state || 'STATE_UNSPECIFIED',
        active_regions: row.activeRegionCodes || [],
        unmet_requirements: (row.unmetRequirements || []).map((req) => req.title || req.name || 'requirement'),
      };
    }
    summary.programs = byProgram;
    // Core paid/organic surfaces not ENABLED is a serving concern — surface, do not hard-block (overview signal).
    for (const id of ['shopping-ads', 'free-listings']) {
      if (byProgram[id] && byProgram[id].state !== 'ENABLED') {
        notes.push(`Program "${id}" is ${byProgram[id].state}, not ENABLED — products may not serve on that surface.`);
      }
    }
    // Only flag unmet requirements for programs that are NOT enabled — an ENABLED program with
    // unmet requirements just means a non-served expansion region (e.g. a KR-only requirement
    // for a NL merchant), which is noise, not a finding.
    for (const [id, info] of Object.entries(byProgram)) {
      if (info.state !== 'ENABLED' && info.unmet_requirements.length > 0) {
        notes.push(`Program "${id}" (${info.state}) has unmet requirement(s): ${info.unmet_requirements.slice(0, 3).join('; ')}.`);
      }
    }
  } else if (programs) {
    notes.push(`Programs unavailable (${programs.label}: ${programs.status || 'error'}).`);
  }

  // Automatic improvements: is Google auto-editing the feed (price/availability/image/shipping)?
  const autoImprovements = resource(accountHealth, 'automatic_improvements');
  if (autoImprovements?.ok) {
    const payload = autoImprovements.payload || {};
    const item = payload.itemUpdates || {};
    const image = payload.imageImprovements || {};
    const shipping = payload.shippingImprovements || {};
    summary.automatic_improvements = {
      item_price_updates: Boolean(item.effectiveAllowPriceUpdates),
      item_availability_updates: Boolean(item.effectiveAllowAvailabilityUpdates),
      item_condition_updates: Boolean(item.effectiveAllowConditionUpdates),
      image_improvements: Boolean(image.effectiveAllowAutomaticImageImprovements),
      shipping_improvements: Boolean(shipping.allowShippingImprovements),
    };
  } else if (autoImprovements) {
    notes.push(`Automatic improvements unavailable (${autoImprovements.label}: ${autoImprovements.status || 'error'}).`);
  }

  // Google Business Profile link (source of local/seller-rating signals). Neutral fact here;
  // the flow doc elevates "not linked" to a highlight when business.md shows local matters.
  const gbp = resource(accountHealth, 'gbp_accounts');
  if (gbp?.ok) {
    const rows = firstArray(gbp.payload, 'gbpAccounts');
    summary.gbp = { linked: rows.length > 0, count: rows.length };
    if (rows.length === 0) {
      notes.push('No Google Business Profile linked — review whether local presence matters for this business (business.md).');
    }
  } else if (gbp) {
    notes.push(`Google Business Profile accounts unavailable (${gbp.label}: ${gbp.status || 'error'}).`);
  }

  // Shipping settings: presence of configured services (a serving requirement in most markets).
  const shippingSettings = resource(accountHealth, 'shipping_settings');
  if (shippingSettings?.ok) {
    const payload = shippingSettings.payload || {};
    const services = firstArray(payload, 'services');
    const warehouses = firstArray(payload, 'warehouses');
    summary.shipping = { configured: services.length > 0, services: services.length, warehouses: warehouses.length };
    if (services.length === 0) {
      notes.push('No shipping services configured in Merchant Center (shipping is a serving requirement in most markets).');
    }
  } else if (shippingSettings) {
    notes.push(`Shipping settings unavailable (${shippingSettings.label}: ${shippingSettings.status || 'error'}).`);
  }

  let gate = 'pass';
  if (blockers.length > 0) gate = 'block';
  else if (available === 0) gate = 'degraded';
  else if (available < total) gate = 'degraded';

  return { gate, available, total, blockers, notes, summary };
}
