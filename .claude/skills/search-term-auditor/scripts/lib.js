/**
 * Shared utilities for search-term-auditor scripts.
 *
 * Extracted from the previous analyze-terms.js and ngram-analysis.js. Adds
 * first-class portfolio bid strategy resolution per PRD §2 decision 14.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

// ── Path helpers ────────────────────────────────────────────────────

export function findProjectRoot(startDir) {
    let dir = startDir;
    while (dir !== '/' && !existsSync(resolve(dir, 'config'))) {
        dir = resolve(dir, '..');
    }
    return dir;
}

// ── CSV + field + numeric utilities ─────────────────────────────────

export function loadCSV(filePath) {
    if (!existsSync(filePath)) return [];
    try {
        const content = readFileSync(filePath, 'utf8');
        return parse(content, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
        console.error(`Warning: Could not parse ${filePath}: ${e.message}`);
        return [];
    }
}

export function f(row, ...names) {
    for (const name of names) {
        if (row[name] !== undefined && row[name] !== '') return row[name];
    }
    return '';
}

export function num(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
}

export function norm(val) {
    return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function key2(a, b) {
    return `${norm(a)}|||${norm(b)}`;
}

export function key3(a, b, c) {
    return `${norm(a)}|||${norm(b)}|||${norm(c)}`;
}

// ── Config loader ───────────────────────────────────────────────────

export function loadConfig(projectRoot) {
    const configPath = resolve(projectRoot, 'config/ads-context.config.json');
    if (!existsSync(configPath)) return {};
    try {
        return JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
        return {};
    }
}

// ── Currency ────────────────────────────────────────────────────────

export const CURRENCY_SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥',
    CHF: 'CHF', NZD: 'NZ$', SEK: 'kr', NOK: 'kr', DKK: 'kr',
    PLN: 'zł', BRL: 'R$', MXN: 'MX$', INR: '₹', ZAR: 'R'
};

export function getCurrencySymbol(config) {
    const currency = (config?.accountCurrency || config?.googleAds?.currency || 'USD').toUpperCase();
    return { currency, currencySymbol: CURRENCY_SYMBOLS[currency] || currency };
}

// ── Business targets (confirmed by Claude in Phase 0.1, cached in config) ──

/**
 * Targets come from config (searchTermAnalysis.targetCPA/maxCPA/targetROAS),
 * written there by the skill's Phase 0.1 after Claude reads business.md.
 * Scripts never parse business.md — free-text extraction is the agent's job.
 */
export function getBusinessTargets(config) {
    const sta = config?.searchTermAnalysis || {};
    const targetCPA = Number.isFinite(Number(sta.targetCPA)) && Number(sta.targetCPA) > 0
        ? Number(sta.targetCPA) : null;
    const maxCPA = Number.isFinite(Number(sta.maxCPA)) && Number(sta.maxCPA) > 0
        ? Number(sta.maxCPA) : null;
    const targetROAS = normalizeRoasRatio(sta.targetROAS ?? null).value;
    return { targetCPA: targetCPA || maxCPA, maxCPA, targetROAS };
}

// ── Brand term matching ─────────────────────────────────────────────

/**
 * Brand variants from config: searchTermAnalysis.brandTerms (preferred, array)
 * or googleAds.brandName (legacy, string or array). All lowercased + trimmed.
 */
export function getBrandVariants(config) {
    const raw = config?.searchTermAnalysis?.brandTerms
        ?? config?.googleAds?.brandName ?? '';
    return (Array.isArray(raw) ? raw : [raw])
        .map(v => String(v ?? '').toLowerCase().trim())
        .filter(Boolean);
}

export function isBrandTerm(term, variants) {
    const t = norm(term);
    return variants.some(v => t.includes(v));
}

/**
 * Coerce human-entered ROAS percentages (e.g. 530) into ratio form (5.3).
 * Values from the Google Ads API are already ratio form and must not use this.
 * Use a conservative threshold so legitimate high targets like 11.5x survive.
 */
export function normalizeRoasRatio(raw) {
    if (raw === null || raw === undefined) return { value: null, normalized: false, original: raw };
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return { value: null, normalized: false, original: raw };
    if (v >= 1000) {
        console.warn(`[lib] normalizeRoasRatio: ROAS ${v} is not plausible (looks like a year or junk) — ignoring`);
        return { value: null, normalized: false, original: v };
    }
    if (v > 50) {
        const fixed = v / 100;
        console.warn(`[lib] normalizeRoasRatio: ROAS ${v} looks like a percentage — normalizing to ${fixed}`);
        return { value: fixed, normalized: true, original: v };
    }
    return { value: v, normalized: false, original: v };
}

function round2(value) {
    return Math.round(value * 100) / 100;
}

function severityTierFromRatio(ratio) {
    if (ratio === Infinity) return { tier: 3, label: 'severe' };
    if (!Number.isFinite(ratio) || ratio <= 1) return null;
    if (ratio <= 1.5) return { tier: 1, label: 'watch' };
    if (ratio <= 2.5) return { tier: 2, label: 'material' };
    return { tier: 3, label: 'severe' };
}

export function buildEfficiencySignal({
    mode,
    cpa,
    roas,
    cost,
    conversions,
    convValue,
    targetCpa,
    targetRoas
}) {
    if (mode === 'roas') {
        if (!(targetRoas > 0) || roas === null || roas === undefined || !(roas < targetRoas)) return null;
        const ratio = roas > 0 ? targetRoas / roas : Infinity;
        const tier = severityTierFromRatio(ratio);
        if (!tier) return null;
        const missingValue = Math.max(0, (targetRoas * cost) - convValue);
        return {
            efficiency_metric: 'roas',
            efficiency_severity_tier: tier.tier,
            efficiency_severity_label: tier.label,
            efficiency_severity_ratio: Number.isFinite(ratio) ? round2(ratio) : null,
            efficiency_impact: round2(missingValue),
            missing_conversion_value: round2(missingValue)
        };
    }

    if (!(targetCpa > 0) || cpa === null || cpa === undefined || !(cpa > targetCpa)) return null;
    const ratio = cpa / targetCpa;
    const tier = severityTierFromRatio(ratio);
    if (!tier) return null;
    const excessSpend = Math.max(0, (cpa - targetCpa) * conversions);
    return {
        efficiency_metric: 'cpa',
        efficiency_severity_tier: tier.tier,
        efficiency_severity_label: tier.label,
        efficiency_severity_ratio: round2(ratio),
        efficiency_impact: round2(excessSpend),
        excess_spend: round2(excessSpend)
    };
}

export function compareEfficiencyPriority(a, b) {
    return (Number(b.efficiency_severity_tier || 0) - Number(a.efficiency_severity_tier || 0))
        || (Number(b.efficiency_impact || 0) - Number(a.efficiency_impact || 0))
        || (Number(b.efficiency_severity_ratio || 0) - Number(a.efficiency_severity_ratio || 0))
        || (Number(b.cost || 0) - Number(a.cost || 0));
}

// ── Enum maps ───────────────────────────────────────────────────────

export const CHANNEL_TYPE_CODES = {
    '2': 'SEARCH',
    '3': 'DISPLAY',
    '4': 'SHOPPING',
    '6': 'VIDEO',
    '9': 'SMART',
    '10': 'MULTI_CHANNEL'
};
export const SKIP_TYPES = new Set(['DISPLAY', 'VIDEO', 'HOTEL', 'LOCAL', 'SMART']);
export const PMAX_TYPES = new Set(['MULTI_CHANNEL', 'PERFORMANCE_MAX']);
export const SHOPPING_TYPES = new Set(['SHOPPING']);

export const BIDDING_STRATEGY_CODES = {
    '2': 'MANUAL_CPC', '3': 'MANUAL_CPM', '6': 'TARGET_CPA', '7': 'PAGE_ONE_PROMOTED',
    '9': 'TARGET_SPEND', '10': 'TARGET_ROAS', '11': 'MAXIMIZE_CONVERSIONS',
    '12': 'MAXIMIZE_CONVERSION_VALUE', '13': 'TARGET_IMPRESSION_SHARE', '14': 'MANUAL_CPV'
};
export const CPA_STRATEGIES = new Set(['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'MANUAL_CPC', 'TARGET_SPEND']);
export const ROAS_STRATEGIES = new Set(['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE']);

export function getCampaignType(row, campaignTypeMap) {
    const direct = f(row, 'campaign.advertising_channel_type', 'campaign_advertising_channel_type');
    if (direct) {
        const code = String(direct).trim();
        return (CHANNEL_TYPE_CODES[code] || direct).toUpperCase();
    }
    const campName = f(row, 'campaign.name', 'campaign_name');
    const fromMap = campaignTypeMap[campName] || 'SEARCH';
    return (CHANNEL_TYPE_CODES[String(fromMap).trim()] || fromMap).toUpperCase();
}

// ── Portfolio bid strategy resolution ────────────────────────────────

/**
 * Load portfolio bid strategies from bidding-strategies.csv.
 * Returns a Map keyed by bidding_strategy.resource_name.
 */
export function loadPortfolioTargets(projectRoot) {
    const map = new Map();
    const csvPath = resolve(projectRoot, 'context/google-ads/data/bidding-strategies.csv');
    const rows = loadCSV(csvPath);
    for (const row of rows) {
        const resourceName = f(row, 'bidding_strategy.resource_name', 'bidding_strategy_resource_name');
        if (!resourceName) continue;

        const id = f(row, 'bidding_strategy.id', 'bidding_strategy_id');
        const name = f(row, 'bidding_strategy.name', 'bidding_strategy_name');
        const rawType = f(row, 'bidding_strategy.type', 'bidding_strategy_type');
        const type = (BIDDING_STRATEGY_CODES[String(rawType).trim()] || String(rawType)).toUpperCase();

        // query.js strips _micros and divides by 1M, so these are already dollar values
        const pCpa = num(f(
            row,
            'bidding_strategy.target_cpa.target_cpa_micros',
            'bidding_strategy_target_cpa_target_cpa_micros',
            'bidding_strategy.target_cpa.target_cpa',
            'bidding_strategy_target_cpa_target_cpa',
            'bidding_strategy.maximize_conversions.target_cpa_micros',
            'bidding_strategy_maximize_conversions_target_cpa_micros',
            'bidding_strategy.maximize_conversions.target_cpa',
            'bidding_strategy_maximize_conversions_target_cpa'
        ));
        const pRoasRaw = num(f(
            row,
            'bidding_strategy.target_roas.target_roas',
            'bidding_strategy_target_roas_target_roas',
            'bidding_strategy.maximize_conversion_value.target_roas',
            'bidding_strategy_maximize_conversion_value_target_roas'
        ));
        const pRoas = pRoasRaw > 0 ? pRoasRaw : 0;

        map.set(resourceName, {
            id,
            name,
            type,
            targetCpa: pCpa > 0 ? pCpa : null,
            targetRoas: pRoas > 0 ? pRoas : null
        });
    }
    return map;
}

/**
 * Resolve the effective bidding strategy + target for a campaign.
 *
 * Precedence per PRD: campaign_inline → portfolio → fallback → none.
 *
 * @param {object} campaignRow  row from campaigns-settings.csv
 * @param {Map} portfolioTargets  output of loadPortfolioTargets()
 * @param {object} fallbackTargets  { targetCPA, targetROAS } from business.md
 * @param {string} fallbackStrategy  'cpa' or 'roas' (account-level default)
 * @returns {object} { targetCpa, targetRoas, biddingMode, strategyType,
 *                     targetSource, portfolioName, portfolioResource }
 */
export function resolveBiddingStrategy(campaignRow, portfolioTargets, fallbackTargets, fallbackStrategy = 'cpa') {
    const rawStrategy = f(campaignRow, 'campaign.bidding_strategy_type', 'campaign_bidding_strategy_type', 'bidding_strategy_type');
    const strategyType = (BIDDING_STRATEGY_CODES[String(rawStrategy).trim()] || String(rawStrategy)).toUpperCase();

    // Inline targets (dollar values — query.js already converted from _micros)
    const inlineCpa = num(f(
        campaignRow,
        'campaign.target_cpa.target_cpa_micros', 'campaign_target_cpa_target_cpa_micros',
        'campaign.target_cpa.target_cpa', 'campaign_target_cpa_target_cpa',
        'campaign.maximize_conversions.target_cpa_micros', 'campaign_maximize_conversions_target_cpa_micros',
        'campaign.maximize_conversions.target_cpa', 'campaign_maximize_conversions_target_cpa'
    ));
    const inlineRoasRaw = num(f(
        campaignRow,
        'campaign.target_roas.target_roas', 'campaign_target_roas_target_roas',
        'campaign.maximize_conversion_value.target_roas', 'campaign_maximize_conversion_value_target_roas'
    ));
    const inlineRoas = inlineRoasRaw > 0 ? inlineRoasRaw : 0;

    const portfolioResource = f(campaignRow, 'campaign.bidding_strategy', 'campaign_bidding_strategy');
    const portfolio = portfolioResource ? portfolioTargets.get(portfolioResource) : null;

    // Determine biddingMode based on strategyType
    let biddingMode;
    if (ROAS_STRATEGIES.has(strategyType)) biddingMode = 'roas';
    else if (CPA_STRATEGIES.has(strategyType)) biddingMode = 'cpa';
    else biddingMode = fallbackStrategy;

    // Try inline first
    if (inlineCpa > 0 && biddingMode === 'cpa') {
        return {
            targetCpa: inlineCpa, targetRoas: null,
            biddingMode: 'cpa', strategyType,
            targetSource: 'campaign_inline',
            portfolioName: '', portfolioResource: ''
        };
    }
    if (inlineRoas > 0 && biddingMode === 'roas') {
        return {
            targetCpa: null, targetRoas: inlineRoas,
            biddingMode: 'roas', strategyType,
            targetSource: 'campaign_inline',
            portfolioName: '', portfolioResource: ''
        };
    }

    // Portfolio attached → read portfolio target
    if (portfolio) {
        if (portfolio.targetCpa && biddingMode === 'cpa') {
            return {
                targetCpa: portfolio.targetCpa, targetRoas: null,
                biddingMode: 'cpa', strategyType,
                targetSource: 'portfolio',
                portfolioName: portfolio.name, portfolioResource
            };
        }
        if (portfolio.targetRoas && biddingMode === 'roas') {
            return {
                targetCpa: null, targetRoas: portfolio.targetRoas,
                biddingMode: 'roas', strategyType,
                targetSource: 'portfolio',
                portfolioName: portfolio.name, portfolioResource
            };
        }
        // Portfolio type might imply a different mode than strategyType suggests
        if (portfolio.targetRoas) {
            return {
                targetCpa: null, targetRoas: portfolio.targetRoas,
                biddingMode: 'roas', strategyType: portfolio.type || strategyType,
                targetSource: 'portfolio',
                portfolioName: portfolio.name, portfolioResource
            };
        }
        if (portfolio.targetCpa) {
            return {
                targetCpa: portfolio.targetCpa, targetRoas: null,
                biddingMode: 'cpa', strategyType: portfolio.type || strategyType,
                targetSource: 'portfolio',
                portfolioName: portfolio.name, portfolioResource
            };
        }
    }

    // Fallback to account-level target from business.md
    const fbCpa = fallbackTargets?.targetCPA || fallbackTargets?.maxCPA || null;
    const fbRoas = fallbackTargets?.targetROAS || null;

    if (biddingMode === 'roas' && fbRoas) {
        return {
            targetCpa: null, targetRoas: fbRoas,
            biddingMode: 'roas', strategyType,
            targetSource: 'fallback',
            portfolioName: '', portfolioResource: ''
        };
    }
    if (biddingMode === 'cpa' && fbCpa) {
        return {
            targetCpa: fbCpa, targetRoas: null,
            biddingMode: 'cpa', strategyType,
            targetSource: 'fallback',
            portfolioName: '', portfolioResource: ''
        };
    }

    // No target available anywhere
    return {
        targetCpa: null, targetRoas: null,
        biddingMode, strategyType,
        targetSource: 'none',
        portfolioName: '', portfolioResource: ''
    };
}

// ── Negative keyword state loader ───────────────────────────────────

export function loadNegativeStatus(projectRoot) {
    const empty = {
        available: false,
        source: null,
        accountTerms: new Set(),
        campaignTerms: new Set(),
        adGroupTerms: new Set(),
        sharedSets: new Map(),           // resource_name|name → { name, terms: Set, campaigns: Set }
        campaignSharedLinks: new Map(),  // campaign → Set of shared_set keys
        linkAwareShared: false,
        warnings: [],
        coverage: {
            campaignLevel: [],
            adGroupLevel: [],
            sharedListRows: [],
            sharedLinkRows: []
        }
    };

    const campaignNegPath = resolve(projectRoot, 'context/google-ads/data/negative-keywords-campaign.csv');
    const adGroupNegPath = resolve(projectRoot, 'context/google-ads/data/negative-keywords-adgroup.csv');
    const sharedNegPath = resolve(projectRoot, 'context/google-ads/data/negative-keywords-shared.csv');
    const sharedLinksPath = resolve(projectRoot, 'context/google-ads/data/negative-keywords-shared-links.csv');

    const hasCampaignNegs = existsSync(campaignNegPath);
    const hasAdGroupNegs = existsSync(adGroupNegPath);
    const hasSharedNegs = existsSync(sharedNegPath);
    const hasSharedLinks = existsSync(sharedLinksPath);

    if (!hasCampaignNegs && !hasAdGroupNegs && !hasSharedNegs) return empty;

    const accountTerms = new Set();
    const campaignTerms = new Set();
    const adGroupTerms = new Set();
    const warnings = [];
    const sources = [];

    const coverage = {
        campaignLevel: [],
        adGroupLevel: [],
        sharedListRows: [],
        sharedLinkRows: []
    };

    if (hasCampaignNegs) {
        sources.push(campaignNegPath);
        const rows = loadCSV(campaignNegPath);
        for (const row of rows) {
            const term = norm(f(row, 'campaign_criterion.keyword.text', 'Keyword', 'keyword', 'criteria'));
            const campaign = norm(f(row, 'campaign.name', 'Campaign', 'campaign'));
            const matchType = f(row, 'campaign_criterion.keyword.match_type', 'Match Type', 'match_type') || 'PHRASE';
            if (!term) continue;
            coverage.campaignLevel.push({ campaign, term, matchType: String(matchType).toUpperCase() });
            if (campaign) campaignTerms.add(`${campaign}|||${term}`);
            else accountTerms.add(term);
        }
    }

    if (hasAdGroupNegs) {
        sources.push(adGroupNegPath);
        const rows = loadCSV(adGroupNegPath);
        for (const row of rows) {
            const term = norm(f(row, 'ad_group_criterion.keyword.text', 'Keyword', 'keyword', 'criteria'));
            const campaign = norm(f(row, 'campaign.name', 'Campaign', 'campaign'));
            const adGroup = norm(f(row, 'ad_group.name', 'Ad Group', 'ad_group'));
            const matchType = f(row, 'ad_group_criterion.keyword.match_type', 'Match Type', 'match_type') || 'PHRASE';
            if (!term) continue;
            coverage.adGroupLevel.push({ campaign, adGroup, term, matchType: String(matchType).toUpperCase() });
            if (campaign && adGroup) adGroupTerms.add(`${campaign}|||${adGroup}|||${term}`);
            else if (campaign) campaignTerms.add(`${campaign}|||${term}`);
            else accountTerms.add(term);
        }
    }

    const sharedSets = new Map();
    const campaignSharedLinks = new Map();
    let linkAwareShared = false;

    if (hasSharedNegs) {
        sources.push(sharedNegPath);
        const sharedRows = loadCSV(sharedNegPath);
        const looseSharedTerms = new Set();

        for (const row of sharedRows) {
            const term = norm(f(row, 'shared_criterion.keyword.text', 'Keyword', 'keyword', 'criteria'));
            if (!term) continue;
            const setId = f(row, 'shared_set.id');
            const setName = f(row, 'shared_set.name', 'Shared Set', 'shared_set');
            const setKey = String(setId || setName || '').trim();
            const matchType = f(row, 'shared_criterion.keyword.match_type', 'Match Type', 'match_type') || 'PHRASE';
            coverage.sharedListRows.push({
                setKey, setName, term, matchType: String(matchType).toUpperCase()
            });
            if (!setKey) {
                looseSharedTerms.add(term);
                continue;
            }
            if (!sharedSets.has(setKey)) {
                sharedSets.set(setKey, { name: setName, terms: new Set(), campaigns: new Set() });
            }
            sharedSets.get(setKey).terms.add(term);
        }

        if (hasSharedLinks) {
            sources.push(sharedLinksPath);
            linkAwareShared = true;
            const linkRows = loadCSV(sharedLinksPath);
            for (const row of linkRows) {
                const campaign = norm(f(row, 'campaign.name', 'Campaign', 'campaign'));
                const setId = f(row, 'shared_set.id');
                const setName = f(row, 'shared_set.name', 'Shared Set', 'shared_set');
                const setKey = String(setId || setName || '').trim();
                if (!campaign || !setKey) continue;
                coverage.sharedLinkRows.push({ campaign, setKey, setName });
                if (!sharedSets.has(setKey)) {
                    sharedSets.set(setKey, { name: setName, terms: new Set(), campaigns: new Set() });
                }
                sharedSets.get(setKey).campaigns.add(campaign);
                if (!campaignSharedLinks.has(campaign)) campaignSharedLinks.set(campaign, new Set());
                campaignSharedLinks.get(campaign).add(setKey);
            }

            for (const [setKey, setData] of sharedSets.entries()) {
                if (setData.campaigns.size === 0) {
                    warnings.push(`Shared set has no campaign links: ${setData.name || setKey}`);
                    for (const term of setData.terms) accountTerms.add(term);
                    continue;
                }
                for (const campaign of setData.campaigns) {
                    for (const term of setData.terms) {
                        campaignTerms.add(`${campaign}|||${term}`);
                    }
                }
            }
        } else {
            warnings.push('Shared negative links file missing; shared terms treated as account-level.');
            for (const setData of sharedSets.values()) {
                for (const term of setData.terms) accountTerms.add(term);
            }
        }
        for (const term of looseSharedTerms) accountTerms.add(term);
    }

    return {
        available: true,
        source: sources.join(', '),
        accountTerms,
        campaignTerms,
        adGroupTerms,
        sharedSets,
        campaignSharedLinks,
        linkAwareShared,
        warnings,
        coverage
    };
}

export function isTermExcluded(negatives, campaign, adGroup, term) {
    const t = norm(term);
    const c = norm(campaign);
    const a = norm(adGroup);
    if (!t) return false;
    if (negatives.adGroupTerms.has(`${c}|||${a}|||${t}`)) return true;
    if (negatives.campaignTerms.has(`${c}|||${t}`)) return true;
    if (negatives.accountTerms.has(t)) return true;
    return false;
}

// ── CLI argument parsing ────────────────────────────────────────────

export function parseCliArgs(argv) {
    return argv.slice(2).reduce((acc, arg) => {
        if (arg.startsWith('--')) {
            const eq = arg.indexOf('=');
            if (eq > -1) acc[arg.slice(2, eq)] = arg.slice(eq + 1);
            else acc[arg.slice(2)] = true;
        }
        return acc;
    }, {});
}
