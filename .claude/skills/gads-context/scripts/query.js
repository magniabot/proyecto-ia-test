#!/usr/bin/env node

/**
 * Google Ads Query Tool - Direct API to CSV
 *
 * Executes Google Ads queries and saves results directly to CSV,
 * bypassing the context window entirely.
 *
 * Usage:
 *   node query.js \
 *     --customer-id=YOUR_CUSTOMER_ID \
 *     --login-customer-id=YOUR_LOGIN_CUSTOMER_ID \
 *     --query-file=references/campaigns.gaql \
 *     --days=30 \
 *     --output=context/google-ads/data/campaigns.csv
 *
 * Flags:
 *   --query="..." or --query-file=path   GAQL query (one required)
 *   --days=N                             Date range (replaces {DATE_RANGE} placeholder)
 *   --no-date-range                      Skip date injection (for current-state queries)
 *   --allow-empty                        Write empty CSV on zero results instead of erroring
 *   --lag-offset=N                       Shift end date back N days (for conversion lag)
 *   --include-experiments                Include experiment campaigns ({EXPERIMENT_FILTER} → empty)
 *
 * Returns: File path and row count only
 */

import { GoogleAdsApi, enums } from 'google-ads-api';
import { createWriteStream, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { once } from 'events';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import {
    createEnumFieldMap,
    deriveHeadersFromGaql,
    rowToCsvLine,
    transformRow,
} from './query-transform.js';

// Find project root by walking up from script location
const __dirname = dirname(fileURLToPath(import.meta.url));
let _projectRoot = __dirname;
while (_projectRoot !== '/' && !existsSync(resolve(_projectRoot, 'config'))) {
    _projectRoot = resolve(_projectRoot, '..');
}

// Load environment variables from config/.env
config({ path: resolve(_projectRoot, 'config/.env') });

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg.includes('=')) {
        const eqIndex = arg.indexOf('=');
        const key = arg.slice(0, eqIndex).replace('--', '');
        const value = arg.slice(eqIndex + 1);
        if (key && value) {
            acc[key] = value;
        }
    } else if (arg.startsWith('--')) {
        // Boolean flags without values
        acc[arg.replace('--', '')] = true;
    }
    return acc;
}, {});

const customerId = args['customer-id'];
const loginCustomerId = args['login-customer-id'];
let query = args['query'];
const queryFile = args['query-file'];
const outputPath = args['output'];

// If --query-file provided, read GAQL from file instead of --query
if (queryFile && !query) {
    const queryFilePath = resolve(_projectRoot, queryFile);
    if (!existsSync(queryFilePath)) {
        console.error(`Error: Query file not found: ${queryFilePath}`);
        process.exit(1);
    }
    query = readFileSync(queryFilePath, 'utf8').trim();
}
const days = args['days'] ? parseInt(args['days']) : null;
const noDateRange = args['no-date-range'] === true;
const lagOffset = args['lag-offset'] ? parseInt(args['lag-offset']) : 0;
const includeExperiments = args['include-experiments'] === true || args['include-experiments'] === 'true';

// Validate arguments
if (!customerId || !query || !outputPath) {
    console.error('Error: Missing required arguments');
    console.error('');
    console.error('Usage:');
    console.error('  ./google-ads-query.js \\');
    console.error('    --customer-id=YOUR_CUSTOMER_ID \\');
    console.error('    --login-customer-id=YOUR_LOGIN_CUSTOMER_ID \\');
    console.error('    --query="SELECT ... FROM ... WHERE ..." \\');
    console.error('    --query-file=references/campaigns.gaql \\  (alternative to --query)');
    console.error('    --days=30 \\  (optional, replaces {DATE_RANGE} placeholder)');
    console.error('    --no-date-range \\  (optional, skip date injection)');
    console.error('    --allow-empty \\  (optional, write empty CSV on zero results)');
    console.error('    --lag-offset=N \\  (optional, shift end date back N days)');
    console.error('    --include-experiments \\  (optional, keep experiment campaigns)');
    console.error('    --output=/path/to/output.csv');
    process.exit(1);
}

// Validate credentials from environment
const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

if (!clientId || !clientSecret || !developerToken || !refreshToken) {
    console.error('Error: Missing Google Ads credentials');
    console.error('Please set the following in config/.env:');
    console.error('  GOOGLE_ADS_CLIENT_ID');
    console.error('  GOOGLE_ADS_CLIENT_SECRET');
    console.error('  GOOGLE_ADS_DEVELOPER_TOKEN');
    console.error('  GOOGLE_ADS_REFRESH_TOKEN');
    process.exit(1);
}

// Initialize Google Ads API client
const client = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
});

const customer = client.Customer({
    customer_id: customerId,
    login_customer_id: loginCustomerId || customerId,
    refresh_token: refreshToken,
});

// Get account timezone and calculate date range if --days provided
async function getAccountTimezone() {
    const timezoneQuery = 'SELECT customer.time_zone FROM customer LIMIT 1';
    const results = await customer.query(timezoneQuery);
    return results[0]?.customer?.time_zone || 'America/Los_Angeles';
}

function calculateDateRange(numDays, timezone, offsetDays = 0) {
    // Get current date in account timezone
    const now = new Date();
    const todayInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    // End date is yesterday to avoid partial current-day data
    // If offsetDays > 0, shift end date further back (e.g., for conversion lag)
    const endDate = new Date(todayInTz);
    endDate.setDate(endDate.getDate() - 1 - offsetDays);

    // Inclusive range with exact N days total
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (numDays - 1));

    // Format as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        start: formatDate(startDate),
        end: formatDate(endDate)
    };
}

function removePartialFile(partialPath) {
    if (existsSync(partialPath)) {
        unlinkSync(partialPath);
    }
}

// Execute query and stream to CSV
async function executeQuery() {
    const partialPath = `${outputPath}.partial`;
    let rowCount = 0;

    try {
        if (!noDateRange) {
            // Handle date range calculation if --days provided
            if (days) {
                const timezone = await getAccountTimezone();
                const dateRange = calculateDateRange(days, timezone, lagOffset);

                // Replace {DATE_RANGE} placeholder with BETWEEN dates
                query = query.replace(
                    /\{DATE_RANGE\}/g,
                    `BETWEEN '${dateRange.start}' AND '${dateRange.end}'`
                );
            }
        }

        // Replace {EXPERIMENT_FILTER}: default excludes experiments, opt-in keeps them
        query = query.replace(
            /\{EXPERIMENT_FILTER\}/g,
            includeExperiments ? '' : "AND campaign.experiment_type = 'BASE'"
        );

        const headers = deriveHeadersFromGaql(query);
        const enumFieldMap = createEnumFieldMap(enums);
        const out = createWriteStream(partialPath, 'utf8');

        try {
            for await (const apiRow of customer.queryStream(query)) {
                if (rowCount === 0) {
                    if (!out.write(`${headers.join(',')}\n`)) {
                        await once(out, 'drain');
                    }
                }

                const row = transformRow(apiRow, enumFieldMap, enums);
                if (!out.write(`${rowToCsvLine(row, headers)}\n`)) {
                    await once(out, 'drain');
                }
                rowCount++;
            }

            out.end();
            await once(out, 'finish');
        } catch (error) {
            out.destroy();
            throw error;
        }

        if (rowCount === 0) {
            removePartialFile(partialPath);
            if (args['allow-empty']) {
                writeFileSync(outputPath, '', 'utf8');
                console.log(`File: ${outputPath}`);
                console.log(`Rows: 0`);
                return;
            }
            console.error('Error: Query returned no results');
            process.exit(1);
        }

        renameSync(partialPath, outputPath);

        // Return minimal output (file path + row count)
        console.log(`File: ${outputPath}`);
        console.log(`Rows: ${rowCount}`);

    } catch (error) {
        console.error('Error executing query:', error.message);
        if (rowCount > 0) {
            console.error(`Partial output retained at: ${partialPath}`);
            console.error(`Rows written before error: ${rowCount}`);
        } else {
            removePartialFile(partialPath);
        }
        if (error.errors) {
            error.errors.forEach(err => {
                console.error(`  - ${err.error_code?.request_error || 'Unknown error'}: ${err.message}`);
            });
        }
        process.exit(1);
    }
}

// Run the query
executeQuery();
