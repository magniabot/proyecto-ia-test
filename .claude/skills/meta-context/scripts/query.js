#!/usr/bin/env node

/**
 * Meta Marketing API Query Tool — API to CSV
 *
 * Fetches Meta Ads entities and saves results directly to CSV.
 * Mirrors the interface of gads-context/scripts/query.js for consistency.
 *
 * Usage:
 *   node query.js --entity=campaigns      --output=context/meta-ads/data/campaigns.csv
 *   node query.js --entity=adsets         --output=context/meta-ads/data/adsets.csv
 *   node query.js --entity=ads            --output=context/meta-ads/data/ads.csv
 *   node query.js --entity=insights-campaign --days=30 --output=context/meta-ads/data/insights-campaign.csv
 *   node query.js --entity=insights-adset    --days=30 --output=context/meta-ads/data/insights-adset.csv
 *   node query.js --entity=insights-ad       --days=30 --output=context/meta-ads/data/insights-ad.csv
 *
 * Credentials: loaded automatically from config/.env in project root
 * Required vars: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Find project root by walking up from script location (same logic as gads-context)
const __dirname = dirname(fileURLToPath(import.meta.url));
let projectRoot = __dirname;
while (projectRoot !== resolve(projectRoot, '..') && !existsSync(resolve(projectRoot, 'config'))) {
    projectRoot = resolve(projectRoot, '..');
}

config({ path: resolve(projectRoot, 'config/.env') });

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
    const eqIdx = arg.indexOf('=');
    if (eqIdx > -1) {
        const key = arg.slice(0, eqIdx).replace(/^--/, '');
        acc[key] = arg.slice(eqIdx + 1);
    } else if (arg.startsWith('--')) {
        acc[arg.replace(/^--/, '')] = true;
    }
    return acc;
}, {});

const entity = args['entity'];
const days = args['days'] ? parseInt(args['days']) : 30;
const outputPath = args['output'];
const allowEmpty = args['allow-empty'] === true;

if (!entity || !outputPath) {
    console.error('Usage: node query.js --entity=<entity> --output=<path> [--days=30]');
    console.error('Entities: campaigns, adsets, ads, insights-campaign, insights-adset, insights-ad');
    process.exit(1);
}

if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    console.error('Error: Missing credentials in config/.env');
    console.error('Required: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID');
    process.exit(1);
}

// Calculate date range (end = yesterday, inclusive N-day window)
function getDateRange(numDays) {
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() - 1);
    const since = new Date(until);
    since.setDate(since.getDate() - (numDays - 1));
    const fmt = (d) => d.toISOString().split('T')[0];
    return { since: fmt(since), until: fmt(until) };
}

// Paginate through Meta cursor-based results
async function fetchAll(url) {
    const results = [];
    let nextUrl = url;

    while (nextUrl) {
        const res = await fetch(nextUrl);
        const data = await res.json();

        if (data.error) {
            console.error(`\nMeta API Error [${data.error.code}]: ${data.error.message}`);
            if (data.error.error_subcode) {
                console.error(`Subcode: ${data.error.error_subcode}`);
            }
            console.error('\nCommon causes:');
            console.error('  - Token does not have required permissions (ads_read, ads_management)');
            console.error('  - AD_ACCOUNT_ID format incorrect (must be act_XXXXXXXXX)');
            console.error('  - System User not assigned to this ad account');
            process.exit(1);
        }

        if (data.data) {
            results.push(...data.data);
        }

        // Follow cursor pagination
        nextUrl = data.paging?.next || null;
    }

    return results;
}

// Flatten nested object to dot notation
// Handles Meta's nested structures (campaign{name}, creative{body}, actions[])
function flatten(obj, prefix = '') {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;

        if (v === null || v === undefined) {
            out[key] = '';
        } else if (k === 'actions' || k === 'cost_per_action_type') {
            // Extract relevant action types as separate columns
            const colPrefix = k === 'actions' ? 'actions' : 'cpa';
            const relevant = [
                'lead',
                'purchase',
                'complete_registration',
                'onsite_conversion.lead_grouped',
                'landing_page_view',
                'link_click',
            ];
            if (Array.isArray(v)) {
                for (const item of v) {
                    if (relevant.includes(item.action_type)) {
                        const safeKey = item.action_type.replace(/\./g, '_');
                        out[`${colPrefix}_${safeKey}`] = item.value;
                    }
                }
            }
        } else if (Array.isArray(v)) {
            out[key] = v.every((i) => typeof i === 'string') ? v.join(' | ') : JSON.stringify(v);
        } else if (typeof v === 'object') {
            Object.assign(out, flatten(v, key));
        } else {
            out[key] = v;
        }
    }
    return out;
}

// Convert array of flat objects to CSV string
function toCSV(rows) {
    if (!rows.length) return '';
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const lines = [headers.join(',')];
    for (const row of rows) {
        const vals = headers.map((h) => {
            let v = String(row[h] ?? '');
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                v = `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        });
        lines.push(vals.join(','));
    }
    return lines.join('\n');
}

// Entity definitions
// Fields follow Meta Marketing API v21.0 field reference
const ENTITIES = {
    campaigns: {
        path: `/${AD_ACCOUNT_ID}/campaigns`,
        params: {
            fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
            limit: 100,
        },
        requiresDate: false,
    },
    adsets: {
        path: `/${AD_ACCOUNT_ID}/adsets`,
        params: {
            fields: [
                'id', 'name', 'status', 'effective_status',
                'campaign_id', 'campaign{name}',
                'daily_budget', 'lifetime_budget',
                'optimization_goal', 'billing_event', 'bid_amount',
                'start_time', 'end_time',
                'targeting{age_min,age_max,genders,geo_locations,publisher_platforms,device_platforms}',
            ].join(','),
            limit: 100,
        },
        requiresDate: false,
    },
    ads: {
        path: `/${AD_ACCOUNT_ID}/ads`,
        params: {
            fields: [
                'id', 'name', 'status', 'effective_status',
                'adset_id', 'adset{name}',
                'campaign_id', 'campaign{name}',
                'creative{id,body,title,call_to_action_type,thumbnail_url,object_story_spec}',
                'created_time', 'updated_time',
            ].join(','),
            limit: 100,
        },
        requiresDate: false,
    },
    'insights-campaign': {
        path: `/${AD_ACCOUNT_ID}/insights`,
        params: {
            level: 'campaign',
            fields: [
                'campaign_id', 'campaign_name',
                'impressions', 'clicks', 'spend',
                'reach', 'frequency',
                'cpm', 'cpc', 'ctr',
                'unique_clicks', 'unique_ctr',
                'actions', 'cost_per_action_type',
            ].join(','),
            limit: 100,
        },
        requiresDate: true,
    },
    'insights-adset': {
        path: `/${AD_ACCOUNT_ID}/insights`,
        params: {
            level: 'adset',
            fields: [
                'adset_id', 'adset_name',
                'campaign_id', 'campaign_name',
                'impressions', 'clicks', 'spend',
                'reach', 'frequency',
                'cpm', 'cpc', 'ctr',
                'actions', 'cost_per_action_type',
            ].join(','),
            limit: 100,
        },
        requiresDate: true,
    },
    'insights-ad': {
        path: `/${AD_ACCOUNT_ID}/insights`,
        params: {
            level: 'ad',
            fields: [
                'ad_id', 'ad_name',
                'adset_id', 'adset_name',
                'campaign_id', 'campaign_name',
                'impressions', 'clicks', 'spend',
                'reach', 'frequency',
                'cpm', 'cpc', 'ctr',
                'actions', 'cost_per_action_type',
            ].join(','),
            limit: 100,
        },
        requiresDate: true,
    },
};

async function main() {
    const entityConfig = ENTITIES[entity];
    if (!entityConfig) {
        console.error(`Unknown entity: "${entity}"`);
        console.error('Valid entities:', Object.keys(ENTITIES).join(', '));
        process.exit(1);
    }

    const params = { ...entityConfig.params, access_token: ACCESS_TOKEN };

    if (entityConfig.requiresDate) {
        const { since, until } = getDateRange(days);
        params.time_range = JSON.stringify({ since, until });
        console.log(`Date range: ${since} → ${until}`);
    }

    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${entityConfig.path}?${qs}`;

    const rows = await fetchAll(url);

    if (!rows.length) {
        if (allowEmpty) {
            // Write empty file
            const absOut = resolve(projectRoot, outputPath);
            mkdirSync(dirname(absOut), { recursive: true });
            writeFileSync(absOut, '', 'utf8');
            console.log(`File: ${outputPath}`);
            console.log(`Rows: 0`);
            return;
        }
        console.error('Error: Query returned no results');
        process.exit(1);
    }

    const flatRows = rows.map((r) => flatten(r));
    const csv = toCSV(flatRows);

    const absOut = resolve(projectRoot, outputPath);
    mkdirSync(dirname(absOut), { recursive: true });
    writeFileSync(absOut, csv, 'utf8');

    console.log(`File: ${outputPath}`);
    console.log(`Rows: ${rows.length}`);
}

main().catch((err) => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
