import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

export class FeedAuditorError extends Error {
  constructor(label, message, details = null) {
    super(message);
    this.name = 'FeedAuditorError';
    this.label = label;
    this.details = details;
  }
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=');
      if (rawValue !== undefined) {
        args[rawKey] = rawValue;
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[rawKey] = argv[i + 1];
        i += 1;
      } else {
        args[rawKey] = true;
      }
    }
  }
  return args;
}

export function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeFilter(value) {
  return value === undefined || value === null || value === '' ? null : String(value).trim();
}

export function getRunFilters(args) {
  return {
    feedLabel: normalizeFilter(args['feed-label'] || args.feedLabel),
    targetCountry: normalizeFilter(args.country || args['target-country'] || args.targetCountry),
    language: normalizeFilter(args.language || args.lang),
  };
}

export function getFeedAuditSettings(config = {}, args = {}) {
  const feedAudit = config.feedAudit || {};
  const googleAds = config.googleAds || {};
  const searchTermAnalysis = config.searchTermAnalysis || {};
  const ngramAnalysis = config.ngramAnalysis || {};

  function intSetting(cliKey, ...values) {
    const first = firstDefined(args[cliKey], ...values);
    const parsed = Number.parseInt(first, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numSetting(...values) {
    const first = firstDefined(...values);
    const parsed = Number.parseFloat(first);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return {
    performancePeriodDays: intSetting('period', feedAudit.performancePeriodDays, googleAds.dateRange, 30),
    conversionLagDays: intSetting('lag', feedAudit.conversionLagDays, searchTermAnalysis.conversionLagDays, 14),
    performanceLabelMetric: normalizePerformanceLabelMetric(
      firstDefined(feedAudit.performanceLabelMetric, feedAudit.performanceLabelMode, searchTermAnalysis.biddingStrategy, ngramAnalysis.biddingStrategy)
    ),
    targetRoas: numSetting(feedAudit.targetRoas, feedAudit.targetROAS, feedAudit.performanceTargetRoas, searchTermAnalysis.targetROAS, ngramAnalysis.targetROAS),
    targetCpa: numSetting(feedAudit.targetCpa, feedAudit.targetCPA, feedAudit.performanceTargetCpa, searchTermAnalysis.targetCPA, ngramAnalysis.targetCPA),
    targetTolerancePercent: numSetting(feedAudit.targetTolerancePercent, feedAudit.percentageDifferenceTarget, 20),
    heroRoasMultiplier: numSetting(feedAudit.heroRoasMultiplier, 1),
    villainSpendMultiplier: numSetting(feedAudit.villainSpendMultiplier, ngramAnalysis.nonConvertingSpendMultiplier, 1),
    clickMultiplier: numSetting(feedAudit.clickMultiplier, 3),
    zombieMaxImpressions: intSetting('zombie-max-impressions', feedAudit.zombieMaxImpressions, 100),
    sidekickMinClicks: intSetting('sidekick-min-clicks', feedAudit.sidekickMinClicks, 1),
  };
}

export function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new FeedAuditorError(label, `Could not read valid JSON at ${path}.`, error.message);
  }
}

export function parseDotenv(path) {
  const env = {};
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

export function getRequiredConfig(config) {
  const googleAds = config.googleAds || {};
  const merchantCenter = config.merchantCenter || {};
  const customerId = normalizeDigits(googleAds.customerId);
  const loginCustomerId = normalizeDigits(googleAds.loginCustomerId || googleAds.customerId);
  const merchantAccountId = normalizeDigits(merchantCenter.accountId);

  if (!customerId) {
    throw new FeedAuditorError(
      'missing-google-ads-config',
      'config/ads-context.config.json is missing googleAds.customerId.'
    );
  }

  if (!merchantCenter.enabled || !merchantAccountId) {
    throw new FeedAuditorError(
      'missing-merchant-config',
      'Merchant Center is not configured. Run /merchant-auth <client> before /feed-auditor.'
    );
  }

  return {
    customerId,
    loginCustomerId,
    merchantAccountId,
    clientName: googleAds.clientName || customerId,
    dateRange: Number.parseInt(googleAds.dateRange || '30', 10),
  };
}

export function getRequiredCredentials(env) {
  const credentials = {
    clientId: env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN,
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new FeedAuditorError(
      'missing-oauth-credentials',
      'Missing Google OAuth credentials. Run /merchant-auth <client>, then update config/.env.'
    );
  }

  return credentials;
}

export async function exchangeRefreshToken({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new FeedAuditorError(
      'oauth-failed',
      'Could not exchange GOOGLE_ADS_REFRESH_TOKEN for an access token.',
      payload.error_description || payload.error || response.status
    );
  }

  return payload.access_token;
}

export async function merchantApiGet(url, { accessToken, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response;
}

export async function guardedMerchantFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    throw new FeedAuditorError(
      'merchant-write-blocked',
      `Merchant API ${method} calls are blocked. feed-auditor is read-only.`
    );
  }
  return merchantApiGet(url, options);
}

export function merchantErrorLabel(status, payloadText) {
  if (/API has not been used|SERVICE_DISABLED|Access Not Configured|disabled/i.test(payloadText)) {
    return 'merchant-api-not-enabled';
  }
  if (status === 400 || status === 404 || /not found|invalid merchant|invalid account|invalid.*accountId/i.test(payloadText)) {
    return 'merchant-account-invalid';
  }
  if (status === 401 || /invalid_token|unauthorized/i.test(payloadText)) {
    return 'oauth-failed';
  }
  if (status === 403 || /permission|forbidden|access denied|not authorized|User cannot access/i.test(payloadText)) {
    return 'merchant-user-access';
  }
  return 'merchant-user-access';
}

export async function fetchMerchantProducts({ merchantAccountId, accessToken, pageSize = 250, fetchImpl = fetch }) {
  const products = [];
  let pageToken = '';

  do {
    const url = new URL(`https://merchantapi.googleapis.com/products/v1/accounts/${merchantAccountId}/products`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await guardedMerchantFetch(url, { accessToken, fetchImpl });
    if (!response.ok) {
      const payloadText = await response.text().catch(() => '');
      throw new FeedAuditorError(
        merchantErrorLabel(response.status, payloadText),
        'Merchant API product pull failed. Run /merchant-auth <client> to refresh Merchant access.',
        payloadText.slice(0, 500)
      );
    }

    const payload = await response.json().catch(() => ({}));
    products.push(...(payload.products || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return products;
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

const MERCHANT_API_BASE = 'https://merchantapi.googleapis.com';

// Read-only account-level Merchant resources used by the account-health pre-check gate.
// Each is fetched defensively: a per-endpoint failure is recorded as unavailable rather
// than aborting the whole audit, so a feed/product audit still runs when an account-level
// endpoint is unsupported for the account, region, or API version.
async function fetchMerchantResource({ url, accessToken, fetchImpl = fetch }) {
  const response = await guardedMerchantFetch(url, { accessToken, fetchImpl });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      label: merchantErrorLabel(response.status, text),
      error: text.slice(0, 400),
    };
  }
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    return { ok: false, status: response.status, label: 'merchant-parse-error', error: error.message };
  }
  return { ok: true, status: response.status, payload };
}

export async function fetchAccountHealth({ merchantAccountId, accessToken, fetchImpl = fetch }) {
  const account = `accounts/${merchantAccountId}`;
  const endpoints = {
    account_issues: {
      label: 'Account issues',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/issues`,
    },
    homepage: {
      label: 'Homepage claim',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/homepage`,
    },
    business_info: {
      label: 'Business info',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/businessInfo`,
    },
    aggregate_product_statuses: {
      label: 'Aggregate product statuses',
      url: `${MERCHANT_API_BASE}/issueresolution/v1/${account}/aggregateProductStatuses`,
    },
    programs: {
      label: 'Programs',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/programs`,
    },
    automatic_improvements: {
      label: 'Automatic improvements',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/automaticImprovements`,
    },
    gbp_accounts: {
      label: 'Google Business Profile accounts',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/gbpAccounts`,
    },
    shipping_settings: {
      label: 'Shipping settings',
      url: `${MERCHANT_API_BASE}/accounts/v1/${account}/shippingSettings`,
    },
  };

  const result = {
    fetched_at: new Date().toISOString(),
    merchant_account_id: merchantAccountId,
    resources: {},
  };

  for (const [key, spec] of Object.entries(endpoints)) {
    // Account-health is a gate, not a scored module: degrade gracefully on any single failure.
    const resource = await fetchMerchantResource({ url: spec.url, accessToken, fetchImpl });
    result.resources[key] = { label: spec.label, ...resource };
  }
  return result;
}

export function normalizePerformanceLabelMetric(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['cpa', 'tcpa', 'cost_per_conversion', 'cost-per-conversion'].includes(normalized)) return 'cpa';
  if (['roas', 'troas', 'poas', 'value', 'conversion_value'].includes(normalized)) return 'roas';
  return 'auto';
}

export function extractCountries(product) {
  const statuses = product.productStatus?.destinationStatuses || [];
  // Approved-first across ALL destinations, then pending, then disapproved, so the first element
  // (used as the fallback target_country) is deterministically an approved market when one exists,
  // regardless of destinationStatuses ordering. When a product still serves several countries the
  // "main market" is a judgment call — SKILL.md has Claude ask the user / use --country for that.
  const countrySet = new Set();
  for (const field of ['approvedCountries', 'pendingCountries', 'disapprovedCountries']) {
    for (const status of statuses) {
      for (const country of status[field] || []) {
        if (country) countrySet.add(country);
      }
    }
  }
  return Array.from(countrySet);
}

export function deriveProductStatus(product) {
  const issues = product.productStatus?.itemLevelIssues || [];
  const destinations = product.productStatus?.destinationStatuses || [];
  if (issues.some((issue) => issue.severity === 'DISAPPROVED')) return 'DISAPPROVED';
  if (destinations.some((status) => (status.disapprovedCountries || []).length > 0)) return 'DISAPPROVED';
  if (destinations.some((status) => (status.pendingCountries || []).length > 0)) return 'PENDING';
  if (destinations.some((status) => (status.approvedCountries || []).length > 0)) return 'APPROVED';
  return product.productStatus?.aggregatedReportingContextStatus || 'UNKNOWN';
}

// --- normalization helpers for the extended attribute set ---
function fmtBool(value) {
  if (value === true || value === false) return String(value);
  if (value === 'true' || value === 'false') return value;
  return '';
}
function fmtMeasure(measure) {
  if (!measure || typeof measure !== 'object') return measure ? String(measure) : '';
  const value = firstDefined(measure.value, measure.amount, '');
  const unit = measure.unit ? ` ${measure.unit}` : '';
  return value === '' ? '' : `${value}${unit}`.trim();
}
function fmtMoney(money) {
  if (!money || typeof money !== 'object') return money ? String(money) : '';
  const micros = firstDefined(money.amountMicros, money.amount_micros, null);
  const amount = micros !== null && micros !== undefined ? Number(micros) / 1e6 : firstDefined(money.amount, money.value, '');
  const currency = firstDefined(money.currencyCode, money.currency_code, '');
  return amount === '' ? '' : `${amount}${currency ? ` ${currency}` : ''}`.trim();
}
function fmtCert(cert) {
  if (!cert || typeof cert !== 'object') return '';
  return [cert.certificationAuthority, cert.certificationName, cert.certificationCode].map((part) => part || '').join(':');
}
function fmtProductDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  const section = firstDefined(detail.sectionName, detail.section_name, '');
  const name = firstDefined(detail.attributeName, detail.attribute_name, '');
  const value = firstDefined(detail.attributeValue, detail.attribute_value, '');
  return [section, name, value].filter((part) => part !== '').join(':');
}

export function normalizeMerchantProduct(product) {
  const attributes = product.productAttributes || product.attributes || {};
  const countries = extractCountries(product);
  const imageLinks = [
    firstDefined(attributes.imageLink, attributes.image_link),
    ...(attributes.additionalImageLinks || attributes.additional_image_links || []),
  ].filter(Boolean);

  return {
    product_id: firstDefined(product.offerId, product.offer_id, product.id, ''),
    merchant_product_name: product.name || '',
    title: firstDefined(product.title, attributes.title, ''),
    description: firstDefined(product.description, attributes.description, ''),
    link: firstDefined(attributes.link, product.link, ''),
    image_link: imageLinks[0] || '',
    additional_image_count: Math.max(0, imageLinks.length - 1),
    // Preserve the additional image URLs (not just the count) so the Tier-2 visual probe can
    // download a couple of them. Pipe-joined to keep the normalized CSV single-valued per field.
    additional_image_links: imageLinks.slice(1).join(' | '),
    brand: firstDefined(attributes.brand, product.brand, ''),
    gtin: (attributes.gtins || attributes.gtin || []).join ? (attributes.gtins || attributes.gtin || []).join(' | ') : firstDefined(attributes.gtins, attributes.gtin, ''),
    mpn: firstDefined(attributes.mpn, ''),
    price: firstDefined(attributes.price?.amountMicros, attributes.price?.amount_micros, product.price?.amountMicros, ''),
    currency: firstDefined(attributes.price?.currencyCode, attributes.price?.currency_code, product.price?.currencyCode, ''),
    availability: firstDefined(attributes.availability, product.availability, ''),
    condition: firstDefined(attributes.condition, product.condition, ''),
    google_product_category: firstDefined(attributes.googleProductCategory, attributes.google_product_category, ''),
    product_type: Array.isArray(attributes.productTypes) ? attributes.productTypes.join(' | ') : firstDefined(attributes.productType, attributes.product_type, ''),
    color: firstDefined(attributes.color, ''),
    size: Array.isArray(attributes.sizes) ? attributes.sizes.join(' | ') : firstDefined(attributes.sizes, attributes.size, ''),
    gender: firstDefined(attributes.gender, ''),
    age_group: firstDefined(attributes.ageGroup, attributes.age_group, ''),
    material: firstDefined(attributes.material, ''),
    pattern: firstDefined(attributes.pattern, ''),
    item_group_id: firstDefined(attributes.itemGroupId, attributes.item_group_id, ''),
    custom_label_0: firstDefined(attributes.customLabel0, attributes.custom_label_0, ''),
    custom_label_1: firstDefined(attributes.customLabel1, attributes.custom_label_1, ''),
    custom_label_2: firstDefined(attributes.customLabel2, attributes.custom_label_2, ''),
    custom_label_3: firstDefined(attributes.customLabel3, attributes.custom_label_3, ''),
    custom_label_4: firstDefined(attributes.customLabel4, attributes.custom_label_4, ''),
    // Extended Data-Spec attributes (present-only validity is the attribute analyser's job).
    identifier_exists: fmtBool(firstDefined(attributes.identifierExists, attributes.identifier_exists, undefined)),
    size_system: firstDefined(attributes.sizeSystem, attributes.size_system, ''),
    size_type: Array.isArray(attributes.sizeTypes) ? attributes.sizeTypes.join(' | ') : firstDefined(attributes.sizeTypes, attributes.sizeType, attributes.size_type, ''),
    adult: fmtBool(firstDefined(attributes.adult, undefined)),
    multipack: attributes.multipack !== undefined && attributes.multipack !== null && attributes.multipack !== '' ? String(attributes.multipack) : '',
    is_bundle: fmtBool(firstDefined(attributes.isBundle, attributes.is_bundle, undefined)),
    unit_pricing_measure: fmtMeasure(attributes.unitPricingMeasure || attributes.unit_pricing_measure),
    unit_pricing_base_measure: fmtMeasure(attributes.unitPricingBaseMeasure || attributes.unit_pricing_base_measure),
    cost_of_goods_sold: fmtMoney(attributes.costOfGoodsSold || attributes.cost_of_goods_sold),
    availability_date: firstDefined(attributes.availabilityDate, attributes.availability_date, ''),
    expiration_date: firstDefined(attributes.expirationDate, attributes.expiration_date, ''),
    shipping_weight: fmtMeasure(attributes.shippingWeight || attributes.shipping_weight),
    shipping_length: fmtMeasure(attributes.shippingLength || attributes.shipping_length),
    shipping_width: fmtMeasure(attributes.shippingWidth || attributes.shipping_width),
    shipping_height: fmtMeasure(attributes.shippingHeight || attributes.shipping_height),
    // Product dimensions/weight (the item itself, distinct from the shipping package) and the
    // free-text / Demand-Gen-surface enrichment attributes — presence is checked by completeness.
    product_length: fmtMeasure(attributes.productLength || attributes.product_length),
    product_width: fmtMeasure(attributes.productWidth || attributes.product_width),
    product_height: fmtMeasure(attributes.productHeight || attributes.product_height),
    product_weight: fmtMeasure(attributes.productWeight || attributes.product_weight),
    product_highlight: Array.isArray(attributes.productHighlights)
      ? attributes.productHighlights.join(' | ')
      : firstDefined(attributes.productHighlights, attributes.product_highlight, ''),
    product_detail: Array.isArray(attributes.productDetails)
      ? attributes.productDetails.map(fmtProductDetail).filter(Boolean).join(' | ')
      : '',
    short_title: firstDefined(attributes.shortTitle, attributes.short_title, ''),
    lifestyle_image_link: Array.isArray(attributes.lifestyleImageLinks)
      ? (attributes.lifestyleImageLinks[0] || '')
      : firstDefined(attributes.lifestyleImageLink, attributes.lifestyle_image_link, ''),
    energy_efficiency_class: firstDefined(attributes.energyEfficiencyClass, attributes.energy_efficiency_class, ''),
    min_energy_efficiency_class: firstDefined(attributes.minEnergyEfficiencyClass, attributes.min_energy_efficiency_class, ''),
    max_energy_efficiency_class: firstDefined(attributes.maxEnergyEfficiencyClass, attributes.max_energy_efficiency_class, ''),
    certification: Array.isArray(attributes.certifications) ? attributes.certifications.map(fmtCert).filter(Boolean).join(' | ') : '',
    excluded_destination: Array.isArray(attributes.excludedDestinations) ? attributes.excludedDestinations.join(' | ') : firstDefined(attributes.excludedDestination, attributes.excluded_destination, ''),
    included_destination: Array.isArray(attributes.includedDestinations) ? attributes.includedDestinations.join(' | ') : firstDefined(attributes.includedDestination, attributes.included_destination, ''),
    pause: firstDefined(attributes.pause, ''),
    feed_label: firstDefined(product.feedLabel, product.feed_label, attributes.feedLabel, attributes.feed_label, ''),
    target_country: firstDefined(product.targetCountry, product.target_country, attributes.targetCountry, attributes.target_country, countries[0], ''),
    language: firstDefined(product.contentLanguage, product.content_language, attributes.contentLanguage, attributes.content_language, ''),
    product_status: deriveProductStatus(product),
    issue_count: product.productStatus?.itemLevelIssues?.length || 0,
    issue_codes: (product.productStatus?.itemLevelIssues || []).map((issue) => issue.code).filter(Boolean).join(' | '),
    destination_countries: countries.join(' | '),
    raw_status_json: product.productStatus ? JSON.stringify(product.productStatus) : '',
  };
}

export function applyProductFilters(products, filters) {
  return products.filter((product) => {
    if (filters.feedLabel && product.feed_label !== filters.feedLabel) return false;
    if (filters.targetCountry && product.target_country !== filters.targetCountry) return false;
    if (filters.language && product.language !== filters.language) return false;
    return true;
  });
}

export function buildPullSummary(products, filters = {}, settings = null) {
  const byFeedLabel = {};
  const byTargetCountry = {};
  const byLanguage = {};
  const byProductStatus = {};

  function add(bucket, key) {
    const normalized = key || '(blank)';
    bucket[normalized] = (bucket[normalized] || 0) + 1;
  }

  for (const product of products) {
    add(byFeedLabel, product.feed_label);
    add(byTargetCountry, product.target_country);
    add(byLanguage, product.language);
    add(byProductStatus, product.product_status);
  }

  return {
    generated_at: new Date().toISOString(),
    filters: {
      feed_label: filters.feedLabel || null,
      target_country: filters.targetCountry || null,
      language: filters.language || null,
    },
    feed_audit_settings: settings,
    product_count: products.length,
    by_feed_label: byFeedLabel,
    by_target_country: byTargetCountry,
    by_language: byLanguage,
    by_product_status: byProductStatus,
  };
}

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).filter((values) => values.some((value) => value !== '')).map((values) => (
    Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))
  ));
}

export function readCsv(path) {
  if (!existsSync(path)) return [];
  return parseCsv(readFileSync(path, 'utf8'));
}

export function writeCsv(path, rows, explicitHeaders = null) {
  const headers = explicitHeaders || Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set())).sort();
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

export function writeJson(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function renderSummaryMarkdown(summary, gaqlResults = []) {
  const lines = [
    '# Feed Auditor Pull Summary',
    '',
    `Generated: ${summary.generated_at}`,
    `Products: ${summary.product_count}`,
    '',
    '## Filters',
    '',
    `- Feed label: ${summary.filters.feed_label || '(none)'}`,
    `- Target country: ${summary.filters.target_country || '(none)'}`,
    `- Language: ${summary.filters.language || '(none)'}`,
    '',
    '## Feed Audit Settings',
    '',
    `- Performance period: ${summary.feed_audit_settings?.performancePeriodDays ?? '(not recorded)'} days`,
    `- Conversion lag: ${summary.feed_audit_settings?.conversionLagDays ?? '(not recorded)'} days`,
    `- Performance label metric: ${summary.feed_audit_settings?.performanceLabelMetric ?? '(not recorded)'}`,
    `- Target ROAS: ${summary.feed_audit_settings?.targetRoas ?? '(account-average fallback)'}`,
    `- Target CPA: ${summary.feed_audit_settings?.targetCpa ?? '(account-average fallback)'}`,
    `- Target tolerance: ${summary.feed_audit_settings?.targetTolerancePercent ?? '(not recorded)'}%`,
    `- Hero ROAS multiplier: ${summary.feed_audit_settings?.heroRoasMultiplier ?? '(not recorded)'} x account average fallback`,
    `- Villain spend multiplier: ${summary.feed_audit_settings?.villainSpendMultiplier ?? '(not recorded)'} x account average cost/conversion`,
    `- Click multiplier: ${summary.feed_audit_settings?.clickMultiplier ?? '(not recorded)'} x account-average clicks/conversion`,
    `- Zombie max impressions: ${summary.feed_audit_settings?.zombieMaxImpressions ?? '(not recorded)'}`,
    `- Sidekick min clicks: ${summary.feed_audit_settings?.sidekickMinClicks ?? '(not recorded)'}`,
    '',
    '## Merchant Product Counts',
    '',
    '### By Feed Label',
    ...Object.entries(summary.by_feed_label).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '### By Target Country',
    ...Object.entries(summary.by_target_country).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '### By Language',
    ...Object.entries(summary.by_language).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '### By Product Status',
    ...Object.entries(summary.by_product_status).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## GAQL Pulls',
    '',
    ...gaqlResults.map((result) => `- ${result.label}: ${result.status} (${result.rows} rows) -> ${result.file}`),
    '',
  ];

  const gpc = summary.gpc_normalization;
  if (gpc) {
    lines.push(
      '## GPC Normalization',
      '',
      `- Resolved to a numeric id: ${gpc.resolved_to_id}/${gpc.total}`,
      `- Taxonomy locales used: ${(gpc.locales_used || []).join(', ') || '(none)'}`,
      '',
      '### By Resolution Source',
      ...Object.entries(gpc.by_source || {}).map(([key, value]) => `- ${key}: ${value}`),
      '',
    );
    if ((gpc.unsupported_languages || []).length) {
      lines.push(
        '### Languages Without a Google Taxonomy (informational)',
        '',
        'Google publishes no product taxonomy for these feed languages, so localized GPC *paths* in them cannot be normalized to an id. This is not a merchant error — numeric ids still resolve normally.',
        '',
        ...gpc.unsupported_languages.map((lang) => `- ${lang}`),
        '',
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function outputPaths(projectRoot) {
  return {
    cacheDir: resolve(projectRoot, 'context/feed/cache'),
    analysisDir: resolve(projectRoot, 'context/analysis/feed'),
    merchantRawJson: resolve(projectRoot, 'context/feed/cache/raw-merchant-products.json'),
    merchantCacheJson: resolve(projectRoot, 'context/feed/cache/merchant-products-normalized.json'),
    merchantCacheCsv: resolve(projectRoot, 'context/feed/cache/merchant-products-normalized.csv'),
    summaryJson: resolve(projectRoot, 'context/feed/cache/pull-summary.json'),
    summaryMd: resolve(projectRoot, 'context/analysis/feed/pull-summary.md'),
    auditReportMd: resolve(projectRoot, 'context/analysis/feed-audit.md'),
    auditLogMd: resolve(projectRoot, 'context/analysis/feed-audit-log.md'),
    evidenceSummaryJson: resolve(projectRoot, 'context/analysis/feed/feed-audit-evidence-summary.json'),
    evidenceSummaryMd: resolve(projectRoot, 'context/analysis/feed/feed-audit-evidence-summary.md'),
    accountHealthJson: resolve(projectRoot, 'context/feed/cache/merchant-account-health.json'),
    moduleScoresJson: resolve(projectRoot, 'context/analysis/feed/module-scores.json'),
    imageProbeJson: resolve(projectRoot, 'context/feed/cache/image-probe.json'),
    imageVisualQueueJson: resolve(projectRoot, 'context/feed/cache/image-visual-queue.json'),
  };
}

// Per-module output file names live directly under context/analysis/feed/ per the
// feed-auditor-module-redesign plan contract.
export function moduleQueuePath(projectRoot, moduleId) {
  return resolve(projectRoot, `context/analysis/feed/${moduleId}-queue.csv`);
}

export function moduleBriefPath(projectRoot, moduleId) {
  return resolve(projectRoot, `context/analysis/feed/${moduleId}-advisory-brief.md`);
}

export function gaqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function buildShoppingProductFilters(filters) {
  const clauses = [];
  if (filters.feedLabel) clauses.push(`AND shopping_product.feed_label = ${gaqlString(filters.feedLabel)}`);
  if (filters.language) clauses.push(`AND shopping_product.language_code = ${gaqlString(filters.language)}`);
  if (filters.targetCountry) clauses.push(`AND shopping_product.target_countries CONTAINS ANY (${gaqlString(filters.targetCountry)})`);
  return clauses.join('\n  ');
}

export function buildShoppingPerformanceFilters(filters) {
  const clauses = [];
  if (filters.feedLabel) clauses.push(`AND segments.product_feed_label = ${gaqlString(filters.feedLabel)}`);
  return clauses.join('\n  ');
}

function num(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productMarketFields(product) {
  return {
    product_id: product.product_id || product['segments.product_item_id'] || product['shopping_product.item_id'] || '',
    feed_label: product.feed_label || product['segments.product_feed_label'] || product['shopping_product.feed_label'] || '',
    target_country: product.target_country || product['segments.product_country'] || product['shopping_product.target_countries'] || '',
    language: product.language || product['segments.product_language'] || product['shopping_product.language_code'] || '',
    title: product.title || product['segments.product_title'] || product['shopping_product.title'] || '',
  };
}

function issueRow(product, fields) {
  const base = {
    ...productMarketFields(product),
    issue_type: fields.issue_type || '',
    severity: fields.severity || '',
    reason: fields.reason || '',
    performance_label: fields.performance_label || '',
    cost: fields.cost ?? '',
    clicks: fields.clicks ?? '',
    conversions: fields.conversions ?? '',
    conversion_value: fields.conversion_value ?? '',
    impressions: fields.impressions ?? '',
  };
  return { ...base, ...fields };
}

function rowKey(row) {
  return [
    row.product_id,
    row.feed_label,
    row.target_country,
    row.language,
    row.issue_type,
    row.reason,
  ].join('\u001f');
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupByMarket(products) {
  const markets = new Map();
  for (const product of products) {
    const key = [
      product.feed_label || '(blank)',
      product.target_country || '(blank)',
      product.language || '(blank)',
    ].join('/');
    if (!markets.has(key)) markets.set(key, []);
    markets.get(key).push(product);
  }
  return markets;
}

export function aggregatePerformanceRows(performanceRows) {
  const byProduct = new Map();
  for (const row of performanceRows) {
    const productId = row['segments.product_item_id'] || row.product_id || '';
    if (!productId) continue;
    const current = byProduct.get(productId) || {
      product_id: productId,
      feed_label: row['segments.product_feed_label'] || row.feed_label || '',
      target_country: row['segments.product_country'] || row.target_country || '',
      language: row['segments.product_language'] || row.language || '',
      title: row['segments.product_title'] || row.title || '',
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversion_value: 0,
    };
    current.impressions += num(row['metrics.impressions'] || row.impressions);
    current.clicks += num(row['metrics.clicks'] || row.clicks);
    current.cost += num(row['metrics.cost'] || row.cost);
    current.conversions += num(row['metrics.conversions'] || row.conversions);
    current.conversion_value += num(row['metrics.conversions_value'] || row.conversion_value);
    byProduct.set(productId, current);
  }
  return byProduct;
}

export function buildPerformanceContext(performanceRows, settings = {}) {
  const convertedRows = performanceRows.filter((row) => row.conversions > 0 && row.cost > 0);
  const activeRows = performanceRows.filter((row) => row.impressions > 0 || row.clicks > 0 || row.cost > 0 || row.conversions > 0);
  const totalCost = convertedRows.reduce((sum, row) => sum + row.cost, 0);
  const totalConversions = convertedRows.reduce((sum, row) => sum + row.conversions, 0);
  const totalValue = convertedRows.reduce((sum, row) => sum + row.conversion_value, 0);
  const totalClicks = activeRows.reduce((sum, row) => sum + row.clicks, 0);
  const averageCostPerConversion = totalConversions > 0 ? totalCost / totalConversions : null;
  const averageRoas = totalCost > 0 ? totalValue / totalCost : null;
  const averageConversionRate = totalClicks > 0 ? totalConversions / totalClicks : null;
  const clicksPerConversionThreshold = totalConversions > 0 ? totalClicks / totalConversions : null;
  const targetMetric = settings.performanceLabelMetric === 'cpa' ||
    (settings.performanceLabelMetric === 'auto' && settings.targetCpa && !settings.targetRoas)
    ? 'cpa'
    : 'roas';
  const tolerance = Math.max(0, num(settings.targetTolerancePercent)) / 100;
  const configuredTarget = targetMetric === 'cpa' ? settings.targetCpa : settings.targetRoas;
  const fallbackTarget = targetMetric === 'cpa' ? averageCostPerConversion : (
    settings.heroRoasMultiplier ? averageRoas * settings.heroRoasMultiplier : averageRoas
  );
  const targetValue = configuredTarget || fallbackTarget;
  const targetSource = configuredTarget ? 'configured_business_target' : 'account_average_fallback';
  const nearTargetValue = targetValue === null || targetValue === undefined ? null : (
    targetMetric === 'cpa' ? targetValue * (1 + tolerance) : targetValue * (1 - tolerance)
  );
  const overTargetValue = targetValue === null || targetValue === undefined ? null : (
    targetMetric === 'cpa' ? targetValue * (1 - tolerance) : targetValue * (1 + tolerance)
  );
  const clickMultiplier = settings.clickMultiplier || 3;

  return {
    averageCostPerConversion,
    averageRoas,
    averageConversionRate,
    clicksPerConversionThreshold,
    highConfidenceClicksThreshold: clicksPerConversionThreshold === null ? null : clicksPerConversionThreshold * clickMultiplier,
    targetMetric,
    targetValue: targetValue ?? null,
    targetSource,
    nearTargetValue,
    overTargetValue,
    targetTolerancePercent: settings.targetTolerancePercent,
    heroRoasThreshold: targetMetric === 'roas' ? (targetValue ?? null) : (averageRoas === null ? null : averageRoas * settings.heroRoasMultiplier),
    villainSpendThreshold: averageCostPerConversion === null ? null : averageCostPerConversion * settings.villainSpendMultiplier,
    zombieMaxImpressions: settings.zombieMaxImpressions,
    sidekickMinClicks: settings.sidekickMinClicks,
    clickMultiplier,
  };
}

export function classifyPerformance(row, context = {}) {
  return classifyPerformanceDetailed(row, context).performance_label;
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

function rounded(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  return Number(Number(value).toFixed(digits));
}

export function classifyPerformanceDetailed(row, context = {}) {
  const perf = row || { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 };
  const roas = ratio(perf.conversion_value, perf.cost);
  const costPerConversion = ratio(perf.cost, perf.conversions);
  const conversionRate = ratio(perf.conversions, perf.clicks);
  const hasNoSignal = perf.impressions === 0 && perf.clicks === 0 && perf.cost === 0 && perf.conversions === 0;
  const lowVisibility = perf.impressions <= context.zombieMaxImpressions && perf.conversions === 0;
  const clickThreshold = context.clicksPerConversionThreshold;
  const highClickThreshold = context.highConfidenceClicksThreshold;
  const enoughClicks = clickThreshold !== null && clickThreshold !== undefined && perf.clicks >= clickThreshold;
  const highConfidenceClicks = highClickThreshold !== null && highClickThreshold !== undefined && perf.clicks >= highClickThreshold;
  const targetValue = context.targetValue;
  const nearTargetValue = context.nearTargetValue;
  const overTargetValue = context.overTargetValue;

  let labelizerBucket = 'no-index';
  let performanceLabel = 'unclassified';
  let basis = 'Insufficient product-level signal for a stronger classification.';

  if (hasNoSignal || lowVisibility) {
    return {
      performance_label: 'zombie',
      labelizer_bucket: 'no-index',
      target_metric: context.targetMetric || 'roas',
      target_source: context.targetSource || 'account_average_fallback',
      target_value: rounded(targetValue),
      near_target_value: rounded(nearTargetValue),
      over_target_value: rounded(overTargetValue),
      roas: rounded(roas),
      cost_per_conversion: rounded(costPerConversion),
      conversion_rate: rounded(conversionRate, 4),
      clicks_per_conversion_threshold: rounded(clickThreshold),
      high_confidence_clicks_threshold: rounded(highClickThreshold),
      classification_basis: hasNoSignal
        ? 'No impressions, clicks, cost, or conversions in the performance window.'
        : `Impressions are at or below the zombie threshold (${context.zombieMaxImpressions}) with no conversions.`,
    };
  }

  if (context.targetMetric === 'cpa' && targetValue !== null && targetValue !== undefined) {
    if (perf.conversions > 0 && highConfidenceClicks && costPerConversion <= overTargetValue) {
      labelizerBucket = 'over-index';
      performanceLabel = 'hero';
      basis = 'CPA is materially better than target with high click sufficiency.';
    } else if (perf.conversions > 0 && enoughClicks && costPerConversion <= targetValue) {
      labelizerBucket = 'index';
      performanceLabel = 'hero';
      basis = 'CPA is at or better than target with enough clicks to evaluate.';
    } else if (perf.conversions > 0 && costPerConversion <= nearTargetValue) {
      labelizerBucket = 'near-index';
      performanceLabel = 'sidekick';
      basis = 'CPA is near target but not strong enough for hero treatment.';
    } else if (perf.conversions > 0 || enoughClicks || (context.villainSpendThreshold !== null && perf.cost >= context.villainSpendThreshold)) {
      labelizerBucket = 'under-index';
      performanceLabel = 'villain';
      basis = 'Spend or conversion evidence is sufficient and CPA is below the target window.';
    }
  } else if (targetValue !== null && targetValue !== undefined) {
    if (perf.conversions > 0 && highConfidenceClicks && roas >= overTargetValue) {
      labelizerBucket = 'over-index';
      performanceLabel = 'hero';
      basis = 'ROAS is materially above target with high click sufficiency.';
    } else if (perf.conversions > 0 && enoughClicks && roas >= targetValue) {
      labelizerBucket = 'index';
      performanceLabel = 'hero';
      basis = 'ROAS is at or above target with enough clicks to evaluate.';
    } else if (perf.conversions > 0 && roas >= nearTargetValue) {
      labelizerBucket = 'near-index';
      performanceLabel = 'sidekick';
      basis = 'ROAS is near target but not strong enough for hero treatment.';
    } else if (perf.conversions > 0 || enoughClicks || (context.villainSpendThreshold !== null && perf.cost >= context.villainSpendThreshold)) {
      labelizerBucket = 'under-index';
      performanceLabel = 'villain';
      basis = 'Spend or conversion evidence is sufficient and ROAS is below the target window.';
    }
  }

  if (
    performanceLabel === 'unclassified' &&
    perf.conversions === 0 &&
    context.villainSpendThreshold !== null &&
    perf.cost >= context.villainSpendThreshold
  ) {
    labelizerBucket = 'under-index';
    performanceLabel = 'villain';
    basis = 'Zero-conversion spend is above the account-relative villain threshold.';
  } else if (
    performanceLabel === 'unclassified' &&
    (perf.conversions > 0 || (clickThreshold === null && perf.clicks >= context.sidekickMinClicks))
  ) {
    performanceLabel = 'sidekick';
    basis = 'Product has some engagement or conversion signal, but not enough for target-window classification.';
  }

  return {
    performance_label: performanceLabel,
    labelizer_bucket: labelizerBucket,
    target_metric: context.targetMetric || 'roas',
    target_source: context.targetSource || 'account_average_fallback',
    target_value: rounded(targetValue),
    near_target_value: rounded(nearTargetValue),
    over_target_value: rounded(overTargetValue),
    roas: rounded(roas),
    cost_per_conversion: rounded(costPerConversion),
    conversion_rate: rounded(conversionRate, 4),
    clicks_per_conversion_threshold: rounded(clickThreshold),
    high_confidence_clicks_threshold: rounded(highClickThreshold),
    classification_basis: basis,
  };
}

function buildItemEligibilityIssues(products, statusRows) {
  const rows = [];
  for (const product of products) {
    if (product.product_status && product.product_status !== 'APPROVED') {
      rows.push(issueRow(product, {
        issue_type: 'merchant_item_status',
        severity: product.product_status === 'DISAPPROVED' ? 'high' : 'medium',
        reason: [product.product_status, product.issue_codes].filter(Boolean).join(': '),
      }));
    } else if (num(product.issue_count) > 0 || product.issue_codes) {
      rows.push(issueRow(product, {
        issue_type: 'merchant_item_issue',
        severity: 'medium',
        reason: product.issue_codes || `${product.issue_count} Merchant item issue(s)`,
      }));
    }
  }
  for (const row of statusRows) {
    const status = row['shopping_product.status'] || '';
    const issueCodes = row['shopping_product.issue_codes'] || '';
    if (status && !['ELIGIBLE', 'APPROVED'].includes(status)) {
      rows.push(issueRow(row, {
        issue_type: 'shopping_product_status',
        severity: status === 'NOT_ELIGIBLE' ? 'high' : 'medium',
        reason: [status, issueCodes].filter(Boolean).join(': '),
      }));
    }
  }
  return uniqueRows(rows);
}

function splitIssueCodes(value) {
  return String(value || '')
    .split('|')
    .map((part) => part.trim().replace(/^(DISAPPROVED|NOT_ELIGIBLE|LIMITED):\s*/i, ''))
    .filter(Boolean);
}

function summarizeIssueCodes(rows, productIdField, issueCodesField) {
  const byCode = new Map();
  for (const row of rows) {
    const productId = row[productIdField] || row.product_id || '';
    for (const code of splitIssueCodes(row[issueCodesField])) {
      const current = byCode.get(code) || { issue_instances: 0, product_ids: new Set() };
      current.issue_instances += 1;
      if (productId) current.product_ids.add(productId);
      byCode.set(code, current);
    }
  }
  return Object.fromEntries(Array.from(byCode.entries())
    .sort(([, a], [, b]) => b.issue_instances - a.issue_instances)
    .map(([code, value]) => [code, {
      issue_instances: value.issue_instances,
      affected_products: value.product_ids.size,
    }]));
}

function buildIssueCodeSummary(products, statusRows) {
  return {
    merchant_item_issues: {
      source: 'context/feed/cache/merchant-products-normalized.* issue_codes from Merchant API productStatus.itemLevelIssues',
      product_rows_with_codes: products.filter((product) => Boolean(product.issue_codes)).length,
      code_counts: summarizeIssueCodes(products, 'product_id', 'issue_codes'),
    },
    ads_shopping_product_status: {
      source: 'context/feed/cache/google-ads-shopping-product-status.csv shopping_product.issue_codes',
      product_rows_with_codes: statusRows.filter((row) => Boolean(row['shopping_product.issue_codes'])).length,
      code_counts: summarizeIssueCodes(statusRows, 'shopping_product.item_id', 'shopping_product.issue_codes'),
    },
  };
}

function buildCompletenessGaps(products) {
  const requiredFields = ['product_id', 'title', 'description', 'link', 'image_link', 'price', 'availability'];
  const rows = [];
  for (const product of products) {
    for (const field of requiredFields) {
      if (!product[field]) {
        rows.push(issueRow(product, {
          issue_type: 'required_attribute_missing',
          severity: ['product_id', 'title', 'link', 'image_link', 'price', 'availability'].includes(field) ? 'high' : 'medium',
          reason: `${field} is blank`,
        }));
      }
    }
    if (!product.brand && !product.gtin && !product.mpn) {
      rows.push(issueRow(product, {
        issue_type: 'identifier_gap',
        severity: 'medium',
        reason: 'brand, gtin, and mpn are blank',
      }));
    }
  }
  return rows;
}

function hasAllCapsProblem(title) {
  const letters = title.replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && letters === letters.toUpperCase();
}

function normalizedText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function meaningfulTokens(value) {
  return normalizedText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function productTypeLeaf(productType) {
  const parts = String(productType || '')
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || '';
}

function titleMissingBrand(title, brand) {
  const normalizedBrand = normalizedText(brand);
  if (!normalizedBrand || normalizedBrand.length < 3) return false;
  if (['unknown', 'merkloos', 'no brand', 'n/a'].includes(normalizedBrand)) return false;
  return !normalizedText(title).includes(normalizedBrand);
}

function titleMissingProductTypeLeaf(title, productType) {
  const leafTokens = meaningfulTokens(productTypeLeaf(productType));
  if (leafTokens.length === 0) return false;
  const normalizedTitle = normalizedText(title);
  return !leafTokens.some((token) => normalizedTitle.includes(token));
}

// Promotional + boilerplate detection is LANGUAGE-SCOPED. The auditor serves merchants in any
// market, so a hardcoded English/Dutch word list would both miss other languages and mis-fire on
// brand names. Each product is matched only against the lexicon for ITS detected content language
// (product.language). When the language is not covered we run the language-agnostic structural
// checks only and skip the lexical ones, rather than guessing.
//
// Claude can EXTEND these per client/language at runtime — without editing this shipped source —
// by writing context/feed/cache/feed-lexicons.json before analyze. See loadLexiconOverrides().
const PROMO_PHRASE_LEXICONS = {
  en: ['free shipping', 'free delivery', 'on sale', 'best price', 'lowest price', 'limited time', 'buy now', 'order now', 'clearance', 'while stocks last', 'money back'],
  nl: ['gratis verzending', 'gratis bezorging', 'nu kopen', 'bestel nu', 'laagste prijs', 'beste prijs', 'op=op', 'voor slechts', 'tijdelijke aanbieding'],
};
// Percent-off promos ("20% off" / "20% korting" / "20% rabatt" / ...) are recognisable from the
// symbol pattern across languages, so they are flagged regardless of the lexicon.
const PROMO_SYMBOL_RE = /\b\d{1,3}\s?%\s?(off|korting|rabatt|reduction|réduction|descuento|sconto|desconto)\b|\bsave\s+\d/i;
const BOILERPLATE_LEXICONS = {
  nl: [/\bis verkrijgbaar bij\b/i, /\bvan het merk\b/i, /\bvoor slechts\b/i],
  en: [/\bavailable (now )?at\b/i, /\bfrom the brand\b/i, /\bfor only\b/i, /\bshop (now|today)\b/i],
};
const HTML_RE = /<\/?[a-z][\s\S]*>/i;
const URL_RE = /https?:\/\/|www\./i;
const EMPTY_BRAND_RE = /merk\s*['"]{2}|brand\s*['"]{2}/i;
const EMPTY_LEXICON_OVERRIDES = { promo: {}, boilerplate: {} };

// Client-local, Claude-authored extension of the built-in lexicons. Lets Claude add promo /
// boilerplate phrases for a language the script doesn't cover (e.g. German, French) WITHOUT
// touching this shipped source — the additions live with the client, scoped to that account.
// Shape (all optional, words are case-insensitive substrings):
//   { "promo_phrases": { "de": ["kostenloser versand", "jetzt kaufen"] },
//     "boilerplate":   { "de": ["erhältlich bei", "von der marke"] } }
function normalizeLexiconMap(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [lang, words] of Object.entries(obj)) {
    const key = String(lang || '').trim().toLowerCase().split(/[-_]/)[0];
    if (!key || !Array.isArray(words)) continue;
    const list = words.map((word) => String(word || '').trim().toLowerCase()).filter(Boolean);
    if (list.length) out[key] = [...(out[key] || []), ...list];
  }
  return out;
}

export function loadLexiconOverrides(projectRoot) {
  if (!projectRoot) return EMPTY_LEXICON_OVERRIDES;
  const path = resolve(projectRoot, 'context/feed/cache/feed-lexicons.json');
  if (!existsSync(path)) return EMPTY_LEXICON_OVERRIDES;
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return EMPTY_LEXICON_OVERRIDES; // malformed override never breaks the audit
  }
  return {
    promo: normalizeLexiconMap(raw.promo_phrases || raw.promo),
    boilerplate: normalizeLexiconMap(raw.boilerplate),
  };
}

// content_language like "nl" or "en-GB" -> primary subtag "nl"/"en".
function productLang(value) {
  return String(value || '').trim().toLowerCase().split(/[-_]/)[0];
}

// Strip the brand out before scanning for promo wording so a brand that happens to contain a promo
// token ("Free People", "Sale & Co") is never flagged as promotional.
function stripBrand(text, brand) {
  const brandText = String(brand || '').trim();
  if (!brandText || brandText.length < 3) return String(text || '');
  try {
    return String(text || '').replace(new RegExp(brandText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  } catch {
    return String(text || '');
  }
}

function hasPromoWording(text, lang, brand, overrides = EMPTY_LEXICON_OVERRIDES) {
  const probe = stripBrand(text, brand);
  if (PROMO_SYMBOL_RE.test(probe)) return true;
  const phrases = [...(PROMO_PHRASE_LEXICONS[lang] || []), ...((overrides.promo && overrides.promo[lang]) || [])];
  if (phrases.length === 0) return false; // language not covered -> structural checks only
  const lower = probe.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase));
}

function hasBoilerplate(text, lang, overrides = EMPTY_LEXICON_OVERRIDES) {
  const builtIn = BOILERPLATE_LEXICONS[lang] || [];
  if (builtIn.some((pattern) => pattern.test(text))) return true;
  const extra = (overrides.boilerplate && overrides.boilerplate[lang]) || [];
  if (extra.length === 0) return false;
  const lower = String(text || '').toLowerCase();
  return extra.some((phrase) => lower.includes(phrase));
}

// Per-product title weakness reasons. This is the SINGLE detector reused by (a) the auditor's
// title-desc module and (b) the feed-optimizer `content` action — both as the rewrite TRIGGER
// (does the existing title trip a rule?) and the post-rewrite VALIDATOR (does the candidate trip
// any rule?). One source of truth keeps "what the auditor flags" === "what the optimizer must not
// emit". Pass a plain context object so a candidate string can be checked without a product row.
export function titleIssues({ title = '', brand = '', product_type = '', language = '' } = {}, overrides = EMPTY_LEXICON_OVERRIDES) {
  const t = String(title || '');
  // A blank title is its own finding (the lexical checks below are meaningless on an empty string).
  // The auditor's weak-title rows still skip blanks (completeness owns missing fields); this puts
  // blank titles in scope for the content action's rewrite trigger and post-rewrite validator.
  if (!t) return ['title is blank'];
  const lang = productLang(language);
  const reasons = [];
  // Length: only genuinely-thin or over-limit titles are findings. A concise 30-150 char title is
  // NOT penalised — Google allows up to 150 and front-loading beats length-padding.
  if (t.length < 30) reasons.push('title is very short (under 30 characters)');
  if (t.length > 150) reasons.push('title exceeds 150 characters');
  if (hasPromoWording(t, lang, brand, overrides)) reasons.push('title contains promotional wording');
  if (hasAllCapsProblem(t)) reasons.push('title is mostly all caps');
  if (titleMissingBrand(t, brand)) reasons.push('brand exists but title does not contain brand');
  if (titleMissingProductTypeLeaf(t, product_type)) reasons.push('title may be missing product_type leaf terms');
  return reasons;
}

// Per-product description weakness reasons. Same dual-use contract as titleIssues(). A blank
// description is a real gap; the lexical checks (promo/boilerplate) are language-scoped and no-op
// for uncovered languages, so they never mis-fire across markets.
export function descriptionIssues({ description = '', brand = '', language = '' } = {}, overrides = EMPTY_LEXICON_OVERRIDES) {
  const d = String(description || '');
  const lang = productLang(language);
  const reasons = [];
  if (!d) reasons.push('description is blank');
  else if (d.length < 80) reasons.push('description is shorter than 80 characters');
  if (hasPromoWording(d, lang, brand, overrides)) reasons.push('description contains promotional wording');
  if (HTML_RE.test(d)) reasons.push('description contains HTML-like markup');
  if (URL_RE.test(d)) reasons.push('description contains a URL');
  if (EMPTY_BRAND_RE.test(d)) reasons.push('description contains an empty brand placeholder');
  if (hasBoilerplate(d.slice(0, 160), lang, overrides)) reasons.push('first 160 characters are store/price boilerplate');
  return reasons;
}

// Content-policy subset shared by ALL prose fields (title, description, short_title, highlights,
// detail) regardless of length/structure rules: no promotional/price text, no ALL-CAPS emphasis, no
// HTML, no URLs, no store/price boilerplate. Used by the feed-optimizer `content` validator so any
// authored field — not just title/description — is held to the same prohibited-content bar the
// auditor enforces. Length and field-specific rules are layered on top by the caller.
export function prohibitedContentIssues({ text = '', brand = '', language = '' } = {}, overrides = EMPTY_LEXICON_OVERRIDES) {
  const s = String(text || '');
  if (!s) return [];
  const lang = productLang(language);
  const reasons = [];
  if (hasPromoWording(s, lang, brand, overrides)) reasons.push('contains promotional wording');
  if (hasAllCapsProblem(s)) reasons.push('is mostly all caps');
  if (HTML_RE.test(s)) reasons.push('contains HTML-like markup');
  if (URL_RE.test(s)) reasons.push('contains a URL');
  if (hasBoilerplate(s, lang, overrides)) reasons.push('contains store/price boilerplate');
  return reasons;
}

function buildWeakTitleRows(products, overrides = EMPTY_LEXICON_OVERRIDES) {
  const rows = [];
  for (const product of products) {
    const title = product.title || '';
    if (!title) continue;
    const reasons = titleIssues(product, overrides);
    if (reasons.length > 0) {
      rows.push(issueRow(product, {
        issue_type: 'weak_title',
        severity: reasons.some((reason) => /promotional|all caps/.test(reason)) ? 'high' : 'medium',
        reason: reasons.join(' | '),
      }));
    }
  }
  return rows;
}

function buildWeakDescriptionRows(products, overrides = EMPTY_LEXICON_OVERRIDES) {
  const rows = [];
  for (const product of products) {
    const description = product.description || '';
    const reasons = descriptionIssues(product, overrides);
    if (reasons.length > 0) {
      rows.push(issueRow(product, {
        issue_type: 'weak_description',
        severity: description ? 'medium' : 'high',
        reason: reasons.join(' | '),
        description,
        description_length: description.length,
        description_first_160: description.slice(0, 160),
      }));
    }
  }
  return rows;
}

function buildImageIssues(products) {
  const rows = [];
  for (const product of products) {
    const reasons = [];
    if (!product.image_link) reasons.push('image_link is blank');
    if (num(product.additional_image_count) === 0) reasons.push('no additional images found');
    if (reasons.length > 0) {
      rows.push(issueRow(product, {
        issue_type: 'image_issue',
        severity: !product.image_link ? 'high' : 'low',
        reason: reasons.join(' | '),
      }));
    }
  }
  return rows;
}

function buildProductTypeGaps(products) {
  return products
    .filter((product) => !product.product_type)
    .map((product) => issueRow(product, {
      issue_type: 'product_type_gap',
      severity: 'medium',
      reason: 'product_type is blank',
    }));
}

function buildPerformanceLabelSnapshot(products, performanceByProduct, performanceContext) {
  return products.map((product) => {
    const perf = performanceByProduct.get(product.product_id) || {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversion_value: 0,
    };
    const classification = classifyPerformanceDetailed(perf, performanceContext);
    return issueRow(product, {
      issue_type: 'performance_label_snapshot',
      severity: 'info',
      reason: 'Diagnostic snapshot only; implement recurring labels in a feed workflow or dedicated tool.',
      performance_label: classification.performance_label,
      labelizer_bucket: classification.labelizer_bucket,
      target_metric: classification.target_metric,
      target_source: classification.target_source,
      target_value: classification.target_value,
      near_target_value: classification.near_target_value,
      over_target_value: classification.over_target_value,
      roas: classification.roas,
      cost_per_conversion: classification.cost_per_conversion,
      conversion_rate: classification.conversion_rate,
      clicks_per_conversion_threshold: classification.clicks_per_conversion_threshold,
      high_confidence_clicks_threshold: classification.high_confidence_clicks_threshold,
      classification_basis: classification.classification_basis,
      cost: Number(perf.cost.toFixed(2)),
      clicks: perf.clicks,
      conversions: perf.conversions,
      conversion_value: Number(perf.conversion_value.toFixed(2)),
      impressions: perf.impressions,
    });
  });
}

function buildLabelCoverage(products, performanceLabels) {
  const rows = [];
  const markets = groupByMarket(products);
  for (const [market, marketProducts] of markets) {
    const [feedLabel, targetCountry, language] = market.split('/');
    const labels = performanceLabels.filter((row) => (
      (row.feed_label || '(blank)') === feedLabel &&
      (row.target_country || '(blank)') === targetCountry &&
      (row.language || '(blank)') === language
    ));
    const labelSet = new Set(labels.map((row) => row.performance_label));
    const customLabelCounts = {};
    for (let index = 0; index <= 4; index += 1) {
      const key = `custom_label_${index}`;
      customLabelCounts[`${key}_populated`] = marketProducts.filter((product) => Boolean(product[key])).length;
    }
    const productTypePopulated = marketProducts.filter((product) => Boolean(product.product_type)).length;
    const productTypeMissing = marketProducts.length - productTypePopulated;
    rows.push({
      feed_label: feedLabel === '(blank)' ? '' : feedLabel,
      target_country: targetCountry === '(blank)' ? '' : targetCountry,
      language: language === '(blank)' ? '' : language,
      total_products: marketProducts.length,
      product_type_populated: productTypePopulated,
      product_type_missing: productTypeMissing,
      ...customLabelCounts,
      performance_labels_observed: Array.from(labelSet).sort().join(' | ') || 'none',
      reason: `${productTypeMissing} product(s) missing product_type; custom label populated counts reflect Merchant customLabel0-4 coverage, not a static upload recommendation.`,
    });
  }
  return rows;
}

function performanceLabelTreatment(label) {
  if (label === 'hero') return 'protect and scale exposure';
  if (label === 'sidekick') return 'maintain and watch for promotion to hero';
  if (label === 'villain') return 'reduce exposure or fix root cause before scaling';
  if (label === 'zombie') return 'force enough visibility to evaluate; do not call bad yet';
  return 'hold for more data';
}

function performanceLabelNote(label, row) {
  if (label === 'hero') return `${row.product_count} product(s) are above the configured target window or account-average fallback.`;
  if (label === 'sidekick') return `${row.product_count} product(s) have usable signal but are not clear hero candidates.`;
  if (label === 'villain') return `${row.product_count} product(s) have enough spend/conversion evidence to investigate waste.`;
  if (label === 'zombie') return `${row.product_count} product(s) have insufficient visibility; they are unknown, not proven bad.`;
  return `${row.product_count} product(s) need more signal before segmentation treatment.`;
}

function buildPerformanceLabelOverview(performanceLabels, performancePrioritizedIssues = []) {
  const issueProductsByLabel = new Map();
  for (const row of performancePrioritizedIssues) {
    const label = row.performance_label || 'unclassified';
    if (!issueProductsByLabel.has(label)) issueProductsByLabel.set(label, new Set());
    if (row.product_id) issueProductsByLabel.get(label).add(row.product_id);
  }

  const buckets = new Map();
  const totalProducts = performanceLabels.length || 1;
  for (const row of performanceLabels) {
    const label = row.performance_label || 'unclassified';
    const current = buckets.get(label) || {
      performance_label: label,
      product_count: 0,
      products_with_conversions: 0,
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversion_value: 0,
      labelizerBucketCounts: {},
    };
    current.product_count += 1;
    current.products_with_conversions += num(row.conversions) > 0 ? 1 : 0;
    current.impressions += num(row.impressions);
    current.clicks += num(row.clicks);
    current.cost += num(row.cost);
    current.conversions += num(row.conversions);
    current.conversion_value += num(row.conversion_value);
    const bucket = row.labelizer_bucket || 'unknown';
    current.labelizerBucketCounts[bucket] = (current.labelizerBucketCounts[bucket] || 0) + 1;
    buckets.set(label, current);
  }

  const labelOrder = ['hero', 'sidekick', 'villain', 'zombie', 'unclassified'];
  return Array.from(buckets.values()).map((row) => {
    const overview = {
      performance_label: row.performance_label,
      product_count: row.product_count,
      product_share_pct: rounded((row.product_count / totalProducts) * 100, 1),
      products_with_conversions: row.products_with_conversions,
      affected_product_count: issueProductsByLabel.get(row.performance_label)?.size || 0,
      impressions: rounded(row.impressions, 0),
      clicks: rounded(row.clicks, 0),
      cost: rounded(row.cost),
      conversions: rounded(row.conversions, 2),
      conversion_value: rounded(row.conversion_value),
      ctr: rounded(ratio(row.clicks, row.impressions), 4),
      conversion_rate: rounded(ratio(row.conversions, row.clicks), 4),
      roas: rounded(ratio(row.conversion_value, row.cost)),
      cost_per_conversion: rounded(ratio(row.cost, row.conversions)),
      avg_cost_per_product: rounded(ratio(row.cost, row.product_count)),
      avg_conversion_value_per_product: rounded(ratio(row.conversion_value, row.product_count)),
      labelizer_bucket_mix: Object.entries(row.labelizerBucketCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucket, count]) => `${bucket}:${count}`)
        .join(' | '),
      primary_treatment: performanceLabelTreatment(row.performance_label),
      report_note: '',
    };
    overview.report_note = performanceLabelNote(row.performance_label, overview);
    return overview;
  }).sort((a, b) => labelOrder.indexOf(a.performance_label) - labelOrder.indexOf(b.performance_label));
}

function buildPerformancePrioritizedIssues(evidence, performanceByProduct, performanceContext) {
  const issueRows = [
    ...evidence.itemEligibilityIssues,
    ...evidence.completenessGaps,
    ...evidence.weakTitleRows,
    ...evidence.weakDescriptionRows,
    ...evidence.imageIssues,
    ...evidence.productTypeGaps,
  ];
  const byProduct = new Map();
  for (const row of issueRows) {
    if (!row.product_id) continue;
    if (!byProduct.has(row.product_id)) {
      const perf = performanceByProduct.get(row.product_id) || {
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversion_value: 0,
      };
      byProduct.set(row.product_id, {
        ...row,
        issue_type: 'performance_prioritized_issue',
        performance_label: classifyPerformance(perf, performanceContext),
        reason: row.reason,
        cost: Number(perf.cost.toFixed(2)),
        clicks: perf.clicks,
        conversions: perf.conversions,
        conversion_value: Number(perf.conversion_value.toFixed(2)),
        impressions: perf.impressions,
      });
    }
  }
  return Array.from(byProduct.values()).sort((a, b) => num(b.cost) - num(a.cost));
}

function topMarketDifference(products, evidenceRows) {
  const markets = groupByMarket(products);
  if (markets.size <= 1) return 'No meaningful market/feed-label/language/country split is present in the current pull.';

  const issueProducts = {};
  for (const [market] of markets) issueProducts[market] = new Set();
  for (const row of evidenceRows) {
    const key = [
      row.feed_label || '(blank)',
      row.target_country || '(blank)',
      row.language || '(blank)',
    ].join('/');
    if (issueProducts[key] !== undefined && row.product_id) issueProducts[key].add(row.product_id);
  }
  const ranked = Array.from(markets.entries()).map(([market, rows]) => ({
    market,
    products: rows.length,
    issueProducts: issueProducts[market]?.size || 0,
  })).sort((a, b) => b.issueProducts - a.issueProducts);

  const leader = ranked[0];
  return `The largest visible split is by feed label / target country / language: ${leader.market} has ${leader.issueProducts} affected product id(s) in the evidence, with ${leader.products} cached product row(s) in that segment.`;
}

function buildRisks({ evidence, products, setupGate }) {
  const risks = {
    'setup/eligibility': [],
    'foundations/completeness': [],
    content: [],
    segmentation: [],
    'performance/prioritization': [],
    'do-not-change': [
      'Do not use this audit as a static performance-label upload plan; use recurring labels in Channable, ProductHero, ProfitMetrics, or an equivalent workflow.',
      'Do not extend this audit into pricing, promotion, or external benchmark strategy; those belong in a future dedicated audit.',
    ],
  };

  if (setupGate !== 'pass') {
    risks['setup/eligibility'].push('Setup gate failed; rerun /merchant-auth and the feed-auditor pull before diagnosing feed quality.');
  }
  if (evidence.itemEligibilityIssues.length > 0) {
    risks['setup/eligibility'].push(`${evidence.itemEligibilityIssues.length} item eligibility issue row(s) need Merchant/feed remediation before optimization.`);
  }
  if (evidence.completenessGaps.length > 0) {
    risks['foundations/completeness'].push(`${evidence.completenessGaps.length} required or identifier attribute gap row(s) weaken product eligibility and matching.`);
  }
  const contentIssueCount = evidence.weakTitleRows.length + evidence.weakDescriptionRows.length + evidence.imageIssues.length;
  if (contentIssueCount > 0) {
    risks.content.push(`${contentIssueCount} title, description, or image issue row(s) limit query matching and Shopping surface quality.`);
  }
  if (evidence.productTypeGaps.length > 0) {
    risks.segmentation.push(`${evidence.productTypeGaps.length} product_type gap row(s) reduce category-level control and downstream transformation quality.`);
  }
  if (evidence.labelCoverage.some((row) => (
    num(row.product_type_missing) > 0 ||
    /none|zombie|villain|unclassified/.test(row.performance_labels_observed || '')
  ))) {
    risks.segmentation.push('Segmentation coverage is incomplete or diagnostic-only; implement recurring segmentation outside this read-only audit.');
  }
  if (evidence.performancePrioritizedIssues.length > 0) {
    risks['performance/prioritization'].push(`${evidence.performancePrioritizedIssues.length} products have feed issues with performance context attached for prioritization.`);
  }
  if (products.length === 0) {
    risks['setup/eligibility'].push('No products were present in the normalized feed cache.');
  }
  return risks;
}

function buildPeerReportStatus(projectRoot, generatedAt = new Date().toISOString()) {
  const generated = new Date(generatedAt);
  const peerSpecs = {
    tracking: { path: 'context/analysis/tracking-audit.md', freshDays: 30 },
    strategy: { path: 'context/analysis/strategy-audit.md', freshDays: 30 },
    bidding: { path: 'context/analysis/bidding-audit.md', freshDays: 7 },
    budget: { path: 'context/analysis/budget-audit.md', freshDays: 7 },
    shopping_structure: { path: 'context/analysis/pmax-audit.md', freshDays: 14 },
    account: { path: 'context/analysis/account-audit.md', freshDays: 30 },
  };
  const reports = {};

  for (const [key, spec] of Object.entries(peerSpecs)) {
    const path = resolve(projectRoot, spec.path);
    if (!existsSync(path)) {
      reports[key] = { status: 'missing', path: spec.path, fresh_window_days: spec.freshDays };
      continue;
    }
    const stats = statSync(path);
    const ageDays = Math.max(0, Math.floor((generated - stats.mtime) / 86400000));
    const text = readFileSync(path, 'utf8').slice(0, 20000);
    reports[key] = {
      status: ageDays <= spec.freshDays ? 'fresh' : 'stale',
      path: spec.path,
      fresh_window_days: spec.freshDays,
      age_days: ageDays,
      top_line: firstMeaningfulMarkdownLine(text),
      has_blocking_language: /blocking|broken|unreliable|misconfigured|not reliable/i.test(text),
    };
  }

  return reports;
}

function firstMeaningfulMarkdownLine(text) {
  return (text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line && !line.startsWith('|') && !line.startsWith('---')) || '';
}

function hasReliableBusinessContext(projectRoot) {
  const businessPath = resolve(projectRoot, 'context/business.md');
  if (!existsSync(businessPath)) return false;
  const text = readFileSync(businessPath, 'utf8');
  if (/TODO|TBD|placeholder|unknown/i.test(text)) return false;
  return /break[- ]?even|profit|margin|roas|cpa|ltv|aov/i.test(text);
}

function buildConfidenceContext({ projectRoot, peerReports, performanceContext }) {
  const tracking = peerReports.tracking || { status: 'missing' };
  const strategy = peerReports.strategy || { status: 'missing' };
  const businessContextReliable = hasReliableBusinessContext(projectRoot);

  let performanceOverlay = 'normal';
  let performanceReason = 'Product performance rows are available for directional prioritization.';
  if (tracking.status === 'fresh' && tracking.has_blocking_language) {
    performanceOverlay = 'blocked';
    performanceReason = 'Fresh tracking report contains blocking or unreliable tracking language.';
  } else if (tracking.status === 'missing') {
    performanceOverlay = 'limited_confidence';
    performanceReason = 'No fresh tracking report exists; product performance tiers are directional, not blocked by default.';
  } else if (tracking.status === 'stale') {
    performanceOverlay = 'advisory';
    performanceReason = 'Tracking report exists but is stale for feed prioritization confidence.';
  }
  if (performanceContext.targetValue === null || performanceContext.villainSpendThreshold === null) {
    performanceOverlay = performanceOverlay === 'blocked' ? 'blocked' : 'advisory';
    performanceReason = `${performanceReason} Target or converted-product baseline is incomplete, so hero/villain calls are advisory.`;
  }

  let businessPriority = 'normal';
  let businessReason = 'Fresh strategy report or reliable business.md context is available.';
  if (strategy.status !== 'fresh' && !businessContextReliable) {
    businessPriority = 'limited_confidence';
    businessReason = 'No fresh strategy report or reliable business.md values exist; major commercial transformations should route through /strategy-specialist.';
  }

  return {
    performance_overlay: {
      status: performanceOverlay,
      reason: performanceReason,
    },
    business_weighted_prioritization: {
      status: businessPriority,
      reason: businessReason,
    },
  };
}

function buildEvidenceSummary(audit) {
  return {
    generated_at: audit.generatedAt,
    claude_report_required: true,
    final_report_owned_by: 'Claude',
    script_role: 'evidence, summaries, and preliminary counts only; module scoring lives in module-scores.json',
    final_report_path: 'context/analysis/feed-audit.md',
    audit_log_path: 'context/analysis/feed-audit-log.md',
    product_count: audit.products.length,
    run_configuration: {
      performance_period_days: audit.settings.performancePeriodDays,
      conversion_lag_days: audit.settings.conversionLagDays,
      performance_label_metric: audit.settings.performanceLabelMetric,
      target_roas: audit.settings.targetRoas,
      target_cpa: audit.settings.targetCpa,
      target_tolerance_percent: audit.settings.targetTolerancePercent,
      hero_roas_multiplier: audit.settings.heroRoasMultiplier,
      villain_spend_multiplier: audit.settings.villainSpendMultiplier,
      click_multiplier: audit.settings.clickMultiplier,
      zombie_max_impressions: audit.settings.zombieMaxImpressions,
      sidekick_min_clicks: audit.settings.sidekickMinClicks,
    },
    performance_label_context: audit.performanceContext,
    performance_label_overview: audit.evidence.performanceLabelOverview,
    issue_code_summary: audit.issueCodeSummary,
    market_narrative: audit.marketNarrative,
    setup_gate: audit.setupGate,
    evidence_counts: Object.fromEntries(Object.entries(audit.evidence).map(([key, rows]) => [key, rows.length])),
    work_queues: audit.risks,
    peer_reports: audit.peerReports,
    confidence_context: audit.confidenceContext,
	    evidence_files: [
	      'context/analysis/feed/module-scores.json',
	      'context/analysis/feed/errors-queue.csv',
	      'context/analysis/feed/completeness-queue.csv',
	      'context/analysis/feed/attributes-queue.csv',
      'context/analysis/feed/title-desc-queue.csv',
      'context/analysis/feed/images-queue.csv',
    ],
  };
}

function renderEvidenceSummaryMarkdown(audit) {
  return [
    `# Feed Audit Evidence Summary - ${audit.generatedDate}`,
    '',
    'This file is helper output for Claude. It is not the final feed audit report.',
    'Module scoring lives in context/analysis/feed/module-scores.json — the only scoring source.',
    '',
    `- Setup gate: ${audit.setupGate}`,
    '',
    '## Evidence Counts',
    '',
    ...Object.entries(audit.evidence).map(([key, rows]) => `- ${key}: ${rows.length}`),
    '',
    '## Issue Code Summary',
    '',
    '- Merchant item issue counts and Google Ads Shopping status issue counts are separated below to avoid double-counting shared image/status issues.',
    `- Merchant item issue rows with codes: ${audit.issueCodeSummary.merchant_item_issues.product_rows_with_codes}`,
    ...Object.entries(audit.issueCodeSummary.merchant_item_issues.code_counts).slice(0, 10).map(([code, row]) => (
      `  - ${code}: ${row.issue_instances} instance(s), ${row.affected_products} product(s)`
    )),
    `- Google Ads Shopping status rows with codes: ${audit.issueCodeSummary.ads_shopping_product_status.product_rows_with_codes}`,
    ...Object.entries(audit.issueCodeSummary.ads_shopping_product_status.code_counts).slice(0, 10).map(([code, row]) => (
      `  - ${code}: ${row.issue_instances} instance(s), ${row.affected_products} product(s)`
    )),
    '',
    '## Confidence Context',
    '',
    `- Performance overlay: ${audit.confidenceContext.performance_overlay.status} - ${audit.confidenceContext.performance_overlay.reason}`,
    `- Business weighting: ${audit.confidenceContext.business_weighted_prioritization.status} - ${audit.confidenceContext.business_weighted_prioritization.reason}`,
    '',
    '## Performance Label Overview',
    '',
    '| Label | Products | Cost | Conversions | Conv. value | ROAS | CPA | Treatment |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...audit.evidence.performanceLabelOverview.map((row) => (
      `| ${row.performance_label} | ${row.product_count} | ${row.cost} | ${row.conversions} | ${row.conversion_value} | ${row.roas} | ${row.cost_per_conversion} | ${row.primary_treatment} |`
    )),
    '',
    '## Peer Reports',
    '',
    ...Object.entries(audit.peerReports).map(([key, report]) => `- ${key}: ${report.status} (${report.path})`),
    '',
	    '## Evidence Files',
	    '',
	    '- context/analysis/feed/module-scores.json',
	    '- context/analysis/feed/{errors,completeness,attributes,title-desc,images}-queue.csv',
    '',
  ].join('\n');
}

export function buildFeedAudit({
  projectRoot = process.cwd(),
  products,
  statusRows = [],
  performanceRows = [],
  pullSummary = {},
  settings = null,
  peerReports = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const productRows = products || [];
  const shoppingStatusRows = statusRows || [];
  const performanceByProduct = aggregatePerformanceRows(performanceRows || []);
  const resolvedSettings = settings || pullSummary.feed_audit_settings || getFeedAuditSettings({}, {});
  const performanceContext = buildPerformanceContext(Array.from(performanceByProduct.values()), resolvedSettings);
  const lexiconOverrides = loadLexiconOverrides(projectRoot);
  const evidence = {
    itemEligibilityIssues: buildItemEligibilityIssues(productRows, shoppingStatusRows),
    completenessGaps: buildCompletenessGaps(productRows),
    weakTitleRows: buildWeakTitleRows(productRows, lexiconOverrides),
    weakDescriptionRows: buildWeakDescriptionRows(productRows, lexiconOverrides),
    imageIssues: buildImageIssues(productRows),
    productTypeGaps: buildProductTypeGaps(productRows),
    labelCoverage: [],
    performancePrioritizedIssues: [],
    performanceLabelSnapshot: [],
    performanceLabelOverview: [],
  };
  evidence.performanceLabelSnapshot = buildPerformanceLabelSnapshot(productRows, performanceByProduct, performanceContext);
  evidence.labelCoverage = buildLabelCoverage(productRows, evidence.performanceLabelSnapshot);
  evidence.performancePrioritizedIssues = buildPerformancePrioritizedIssues(evidence, performanceByProduct, performanceContext);
  evidence.performanceLabelOverview = buildPerformanceLabelOverview(evidence.performanceLabelSnapshot, evidence.performancePrioritizedIssues);

  const setupGate = productRows.length > 0 ? 'pass' : 'fail';
  const risks = buildRisks({ evidence, products: productRows, setupGate });
  const allIssueRows = [
    ...evidence.itemEligibilityIssues,
    ...evidence.completenessGaps,
    ...evidence.weakTitleRows,
    ...evidence.weakDescriptionRows,
    ...evidence.imageIssues,
    ...evidence.productTypeGaps,
  ];
  const marketNarrative = topMarketDifference(productRows, allIssueRows);
  const resolvedPeerReports = peerReports || buildPeerReportStatus(projectRoot, generatedAt);
  const confidenceContext = buildConfidenceContext({
    projectRoot,
    peerReports: resolvedPeerReports,
    performanceContext,
  });
  const audit = {
    generatedAt,
    generatedDate: generatedAt.slice(0, 10),
    products: productRows,
    pullSummary,
    settings: resolvedSettings,
    performanceContext,
    issueCodeSummary: buildIssueCodeSummary(productRows, shoppingStatusRows),
    evidence,
    setupGate,
    risks,
    marketNarrative,
    peerReports: resolvedPeerReports,
    confidenceContext,
  };
  audit.evidenceSummary = buildEvidenceSummary(audit);
  audit.evidenceSummaryMarkdown = renderEvidenceSummaryMarkdown(audit);
  return audit;
}

export function analyzeFeedAudit({
  projectRoot,
  generatedAt = new Date().toISOString(),
} = {}) {
  const paths = outputPaths(projectRoot);
  const products = existsSync(paths.merchantCacheJson)
    ? loadJson(paths.merchantCacheJson, 'missing-merchant-cache')
    : readCsv(paths.merchantCacheCsv);
  const statusRows = readCsv(resolve(paths.cacheDir, 'google-ads-shopping-product-status.csv'));
  const performanceRows = readCsv(resolve(paths.cacheDir, 'google-ads-shopping-performance.csv'));
  const pullSummary = existsSync(paths.summaryJson) ? loadJson(paths.summaryJson, 'missing-pull-summary') : {};
  const configPath = resolve(projectRoot, 'config/ads-context.config.json');
  const hasConfig = existsSync(configPath);
  const config = hasConfig ? loadJson(configPath, 'missing-config') : {};
  const settings = hasConfig
    ? { ...(pullSummary.feed_audit_settings || {}), ...getFeedAuditSettings(config, {}) }
    : (pullSummary.feed_audit_settings || getFeedAuditSettings(config, {}));
  const audit = buildFeedAudit({ projectRoot, products, statusRows, performanceRows, pullSummary, settings, generatedAt });

  // Evidence is computed in memory and consumed by the module layer (lib/modules/*). The
  // legacy per-issue evidence CSVs are no longer written — per-module queues + module-scores.json
  // are the canonical outputs. The evidence summary is retained for confidence context.
  writeJson(paths.evidenceSummaryJson, audit.evidenceSummary);
  mkdirSync(dirname(paths.evidenceSummaryMd), { recursive: true });
  writeFileSync(paths.evidenceSummaryMd, audit.evidenceSummaryMarkdown, 'utf8');

  audit.outputs = {
    evidenceSummaryJson: paths.evidenceSummaryJson,
    evidenceSummaryMd: paths.evidenceSummaryMd,
    evidenceDir: paths.analysisDir,
  };
  return audit;
}
