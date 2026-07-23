#!/usr/bin/env node

import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  FeedAuditorError,
  applyProductFilters,
  buildPullSummary,
  buildShoppingPerformanceFilters,
  buildShoppingProductFilters,
  exchangeRefreshToken,
  fetchAccountHealth,
  fetchMerchantProducts,
  getRequiredConfig,
  getRequiredCredentials,
  getFeedAuditSettings,
  getRunFilters,
  loadJson,
  normalizeMerchantProduct,
  outputPaths,
  parseArgs,
  parseDotenv,
  renderSummaryMarkdown,
  writeCsv,
  writeJson,
} from './lib/feed-auditor-core.js';
import {
  fetchTaxonomiesForLanguages,
  loadTaxonomies,
  enrichProductsWithGpc,
} from './lib/taxonomy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveProjectRoot(startDir) {
  let current = resolve(startDir);
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'config/ads-context.config.json'))) {
      return current;
    }
    current = dirname(current);
  }

  throw new FeedAuditorError(
    'client-root-not-found',
    'Could not find PPCOS client root (no config/ads-context.config.json). Run this from a client workspace.'
  );
}

function ensureQueryScript(projectRoot) {
  const queryScript = resolve(projectRoot, '.claude/skills/gads-context/scripts/query.js');
  if (!existsSync(queryScript)) {
    throw new FeedAuditorError(
      'missing-query-script',
      'Could not find .claude/skills/gads-context/scripts/query.js. feed-auditor reuses this helper for human-readable GAQL enum output.'
    );
  }
  return queryScript;
}

function renderGaql({ sourcePath, tmpPath, merchantAccountId, filters, mode }) {
  const raw = readFileSync(sourcePath, 'utf8');
  const filterText = mode === 'shopping-product'
    ? buildShoppingProductFilters(filters)
    : buildShoppingPerformanceFilters(filters);
  const rendered = raw
    .replace(/\{MERCHANT_ACCOUNT_ID\}/g, merchantAccountId)
    .replace(/\{RUN_FILTERS\}/g, filterText);

  mkdirSync(dirname(tmpPath), { recursive: true });
  writeFileSync(tmpPath, rendered, 'utf8');
  return tmpPath;
}

function googleAdsLabel(errorText) {
  if (/API has not been used|SERVICE_DISABLED|Google Ads API.*disabled/i.test(errorText)) {
    return 'google-ads-api-not-enabled';
  }
  if (/PERMISSION_DENIED|USER_PERMISSION_DENIED|does not have permission|access.*denied/i.test(errorText)) {
    return 'google-ads-user-access';
  }
  return 'google-ads-credential-failure';
}

function runGaql({ projectRoot, queryScript, customerId, loginCustomerId, queryFile, outputFile, days = null, lagOffset = 0, noDateRange = false, allowEmpty = true }) {
  const args = [
    queryScript,
    `--customer-id=${customerId}`,
    `--login-customer-id=${loginCustomerId}`,
    `--query-file=${queryFile}`,
    `--output=${outputFile}`,
  ];

  if (noDateRange) {
    args.push('--no-date-range');
  } else {
    args.push(`--days=${days}`);
    if (lagOffset) args.push(`--lag-offset=${lagOffset}`);
  }
  if (allowEmpty) args.push('--allow-empty');

  try {
    const output = execFileSync('node', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 180000,
    });
    const rowsMatch = output.match(/Rows:\s*(\d+)/);
    return {
      status: 'OK',
      rows: rowsMatch ? Number.parseInt(rowsMatch[1], 10) : 0,
      output,
    };
  } catch (error) {
    const text = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
    throw new FeedAuditorError(
      googleAdsLabel(text),
      'Google Ads API pull failed. Run /merchant-auth <client> to refresh combined Ads + Merchant access.',
      text.slice(0, 1000)
    );
  }
}

function printError(error, clientName) {
  if (error instanceof FeedAuditorError) {
    console.error(`\nError [${error.label}]: ${error.message}`);
    console.error(`Route: /merchant-auth ${clientName || '<client>'}`);
    if (error.details && process.env.FEED_AUDITOR_DEBUG === '1') {
      console.error(`Details: ${error.details}`);
    }
  } else {
    console.error(`\nError [unexpected]: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let clientName = null;

  try {
    const projectRoot = resolveProjectRoot(args['client-root'] || process.cwd());
    const configPath = resolve(projectRoot, 'config/ads-context.config.json');
    const envPath = resolve(projectRoot, 'config/.env');
    const scriptGaqlDir = resolve(__dirname, '..', 'reference/gaql');
    const tmpGaqlDir = resolve(__dirname, '..', 'tmp/gaql');
    const paths = outputPaths(projectRoot);

    const config = loadJson(configPath, 'missing-config');
    clientName = config.googleAds?.clientName || config.googleAds?.customerId || null;
    const required = getRequiredConfig(config);
    clientName = required.clientName;

    if (!existsSync(envPath)) {
      throw new FeedAuditorError(
        'missing-oauth-credentials',
        'Missing config/.env. Run /merchant-auth <client>, then update config/.env.'
      );
    }

    const filters = getRunFilters(args);
    const settings = getFeedAuditSettings(config, args);
    const period = settings.performancePeriodDays;
    const queryScript = ensureQueryScript(projectRoot);

    // Freshness gate: reuse the cache when it is younger than the freshness window so that
    // running several modules in a row does not re-hit the API each time. --refresh forces
    // a re-pull. Mirrors the <24h gate feed-optimizer enforces.
    const freshnessHours = Number.parseInt(args['freshness-hours'] || '24', 10);
    const forceRefresh = Boolean(args.refresh);
    const requiredFoundationCache = [
      paths.merchantCacheJson,
      paths.merchantCacheCsv,
      paths.summaryJson,
      paths.accountHealthJson,
      resolve(paths.cacheDir, 'google-ads-shopping-product-status.csv'),
      resolve(paths.cacheDir, 'google-ads-shopping-performance.csv'),
    ];
    const foundationMissing = requiredFoundationCache.filter((path) => !existsSync(path));
    if (!forceRefresh && foundationMissing.length === 0) {
      const ageMs = Date.now() - statSync(paths.merchantCacheJson).mtimeMs;
      const ageHours = ageMs / 3600000;
      if (ageHours < freshnessHours) {
        console.log('\nFeed Auditor - Data Pull Foundation');
        console.log(`Cache is fresh (${ageHours.toFixed(1)}h < ${freshnessHours}h). Reusing existing pull.`);
        console.log('Pass --refresh to force a new pull.');
        console.log('\n__RESULTS_JSON__');
        console.log(JSON.stringify({ reused_cache: true, cache_age_hours: Number(ageHours.toFixed(2)) }));
        return;
      }
    } else if (!forceRefresh && foundationMissing.length > 0 && existsSync(paths.merchantCacheJson)) {
      console.log('\nFeed Auditor - Data Pull Foundation');
      console.log('Cache is incomplete; refreshing instead of reusing it.');
      for (const missingPath of foundationMissing) {
        console.log(`  Missing: ${missingPath.replace(projectRoot + '/', '')}`);
      }
    }

    mkdirSync(paths.cacheDir, { recursive: true });
    mkdirSync(paths.analysisDir, { recursive: true });
    mkdirSync(tmpGaqlDir, { recursive: true });

    console.log('\nFeed Auditor - Data Pull Foundation');
    console.log(`Client: ${required.clientName}`);
    console.log(`Google Ads customer: ${required.customerId}`);
    console.log(`Merchant account: ${required.merchantAccountId}`);
    console.log(`Period: ${period} days`);
    console.log(`Conversion lag: ${settings.conversionLagDays} days`);
    console.log(`Performance labeling: metric=${settings.performanceLabelMetric}; target_roas=${settings.targetRoas || 'account-average fallback'}; target_cpa=${settings.targetCpa || 'account-average fallback'}; tolerance=${settings.targetTolerancePercent}%; click_multiplier=${settings.clickMultiplier}; villain spend >= ${settings.villainSpendMultiplier}x account-average cost/conversion; zombie <= ${settings.zombieMaxImpressions} impressions with no conversions.`);
    console.log(`Filters: feed_label=${filters.feedLabel || '-'} country=${filters.targetCountry || '-'} language=${filters.language || '-'}\n`);

    const validationGaql = resolve(tmpGaqlDir, 'google-ads-validation.gaql');
    writeFileSync(validationGaql, 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1\n', 'utf8');

    console.log('Validating Google Ads API access...');
    runGaql({
      projectRoot,
      queryScript,
      customerId: required.customerId,
      loginCustomerId: required.loginCustomerId,
      queryFile: validationGaql,
      outputFile: resolve(tmpGaqlDir, 'google-ads-validation.csv'),
      noDateRange: true,
      allowEmpty: false,
    });
    console.log('Google Ads API access validated.');

    console.log('Validating Merchant API access and pulling products...');
    const env = parseDotenv(envPath);
    const credentials = getRequiredCredentials(env);
    const accessToken = await exchangeRefreshToken(credentials);
    const rawProducts = await fetchMerchantProducts({
      merchantAccountId: required.merchantAccountId,
      accessToken,
    });
    console.log(`Merchant products returned: ${rawProducts.length}`);

    const normalizedProducts = applyProductFilters(
      rawProducts.map((product) => normalizeMerchantProduct(product)),
      filters
    );
    console.log(`Merchant products after filters: ${normalizedProducts.length}`);

    writeJson(paths.merchantRawJson, rawProducts);

    // GPC i18n normalization. Refresh the English taxonomy (always needed for the vertical's
    // English path) plus one file per distinct feed language Google publishes, then enrich every
    // product with a canonical numeric gpc_id, its English path, and a resolution status. Never
    // fatal: unsupported languages and fetch failures leave the id blank and are reported, not
    // crashed. Must run BEFORE the cache write so the persisted product records carry the new fields.
    console.log('Refreshing Google product taxonomy cache(s) for GPC normalization...');
    const distinctLanguages = [...new Set(normalizedProducts.map((product) => product.language).filter(Boolean))];
    const taxonomyResult = await fetchTaxonomiesForLanguages(distinctLanguages);
    console.log(`  Taxonomy locales cached: ${taxonomyResult.localesFetched.join(', ') || '(none)'}`);
    if (taxonomyResult.unsupportedLanguages.length) {
      console.log(`  No Google taxonomy for: ${taxonomyResult.unsupportedLanguages.join(', ')} (localized GPC paths in these languages stay unresolved — informational).`);
    }
    const taxonomies = loadTaxonomies(taxonomyResult.localesFetched);
    const gpcNormalization = enrichProductsWithGpc(normalizedProducts, taxonomies, taxonomyResult.unsupportedLanguages);
    console.log(`  GPC normalization: ${gpcNormalization.resolved_to_id}/${gpcNormalization.total} products resolved to a numeric id.`);

    writeJson(paths.merchantCacheJson, normalizedProducts);
    writeCsv(paths.merchantCacheCsv, normalizedProducts);

    // Account-health pre-check gate data (read-only, account-level). Degrades gracefully:
    // a failed endpoint is recorded as unavailable, not fatal, so the product audit still runs.
    console.log('Pulling account-health (account issues, homepage, business info, aggregate statuses, programs, automatic improvements, GBP, shipping)...');
    const accountHealth = await fetchAccountHealth({
      merchantAccountId: required.merchantAccountId,
      accessToken,
    });
    writeJson(paths.accountHealthJson, accountHealth);
    const totalResources = Object.keys(accountHealth.resources).length;
    const availableResources = Object.values(accountHealth.resources).filter((resource) => resource.ok).length;
    console.log(`  Account-health resources available: ${availableResources}/${totalResources}`);

    console.log('Pulling auditor-owned GAQL cache data...');
    const gaqlRuns = [
      {
        label: 'Shopping Product Status',
        source: resolve(scriptGaqlDir, 'shopping-product-status.gaql'),
        tmp: resolve(tmpGaqlDir, 'shopping-product-status.rendered.gaql'),
        mode: 'shopping-product',
        output: resolve(paths.cacheDir, 'google-ads-shopping-product-status.csv'),
        noDateRange: true,
      },
      {
        label: 'Shopping Performance',
        source: resolve(scriptGaqlDir, 'shopping-performance.gaql'),
        tmp: resolve(tmpGaqlDir, 'shopping-performance.rendered.gaql'),
        mode: 'shopping-performance',
        output: resolve(paths.cacheDir, 'google-ads-shopping-performance.csv'),
        noDateRange: false,
      },
    ];

    const gaqlResults = [];
    for (const run of gaqlRuns) {
      const queryFile = renderGaql({
        sourcePath: run.source,
        tmpPath: run.tmp,
        merchantAccountId: required.merchantAccountId,
        filters,
        mode: run.mode,
      });
      const result = runGaql({
        projectRoot,
        queryScript,
        customerId: required.customerId,
        loginCustomerId: required.loginCustomerId,
        queryFile,
        outputFile: run.output,
        days: period,
        lagOffset: run.noDateRange ? 0 : settings.conversionLagDays,
        noDateRange: run.noDateRange,
        allowEmpty: true,
      });
      gaqlResults.push({
        label: run.label,
        file: relative(projectRoot, run.output),
        rows: result.rows,
        status: result.status,
      });
      console.log(`  ${run.label}: ${result.rows} rows`);
    }

    const summary = buildPullSummary(normalizedProducts, filters, settings);
    summary.gpc_normalization = gpcNormalization;
    writeJson(paths.summaryJson, { ...summary, gaql_results: gaqlResults });
    writeFileSync(paths.summaryMd, renderSummaryMarkdown(summary, gaqlResults), 'utf8');

    console.log('\nDone.');
    console.log(`Cache: ${relative(projectRoot, paths.cacheDir)}`);
    console.log(`Evidence: ${relative(projectRoot, paths.analysisDir)}`);
    console.log(`Summary: ${relative(projectRoot, paths.summaryMd)}`);
    console.log('\n__RESULTS_JSON__');
    console.log(JSON.stringify({ summary, gaql_results: gaqlResults }));
  } catch (error) {
    printError(error, clientName);
    process.exitCode = 1;
  }
}

main();
