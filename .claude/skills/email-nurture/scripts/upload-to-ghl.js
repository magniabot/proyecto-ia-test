#!/usr/bin/env node

/**
 * GHL Email Template Uploader
 *
 * Uploads a generated HTML email as a template directly to a GHL sub-account
 * via the Go High Level v2 API (LeadConnector).
 *
 * Usage:
 *   node upload-to-ghl.js \
 *     --file=path/to/email.html \
 *     --name="SOS #1 — Bienvenida | Inversor Renta" \
 *     --subject="{{contact.first_name}}, esto empieza ahora"
 *
 * Optional flags:
 *   --dry-run     Validate inputs and show payload without calling the API
 *
 * Credentials loaded from config/.env:
 *   GHL_IDENTIFICADOR_SECRETO   API key for the GHL sub-account (private integration token)
 *
 * Location ID loaded from config/ads-context.config.json:
 *   ghl.locationId
 *
 * GHL API reference:
 *   https://highlevel.stoplight.io/docs/integrations/
 *   Endpoint: POST https://services.leadconnectorhq.com/templates/
 *   Required header: Version: 2021-07-28
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// ─── Project root resolution ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let projectRoot = __dirname;
while (projectRoot !== '/' && !existsSync(resolve(projectRoot, 'config'))) {
    projectRoot = resolve(projectRoot, '..');
}

// Load .env from config/
config({ path: resolve(projectRoot, 'config/.env') });

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg === '--dry-run') {
        acc['dry-run'] = true;
    } else if (arg.includes('=')) {
        const eqIndex = arg.indexOf('=');
        const key = arg.slice(0, eqIndex).replace(/^--/, '');
        const value = arg.slice(eqIndex + 1);
        if (key && value) acc[key] = value;
    }
    return acc;
}, {});

const htmlFilePath  = args['file'];
const templateName  = args['name'];
const subjectLine   = args['subject'];
const isDryRun      = args['dry-run'] === true;

// ─── Input validation ─────────────────────────────────────────────────────────

const errors = [];

if (!htmlFilePath)  errors.push('Missing --file: path to the HTML email file');
if (!templateName)  errors.push('Missing --name: template name as it will appear in GHL');
if (!subjectLine)   errors.push('Missing --subject: default subject line for the template');

if (errors.length) {
    console.error('\nError: Missing required arguments\n');
    errors.forEach(e => console.error(`  • ${e}`));
    console.error('\nUsage example:');
    console.error('  node upload-to-ghl.js \\');
    console.error('    --file=created/email-sequences/20260317_sos-01-bienvenida_inversor-renta.html \\');
    console.error('    --name="SOS #1 — Bienvenida | Inversor Renta" \\');
    console.error('    --subject="{{contact.first_name}}, esto empieza ahora"');
    process.exit(1);
}

// Resolve file path relative to project root if not absolute
const resolvedFilePath = htmlFilePath.startsWith('/')
    ? htmlFilePath
    : resolve(projectRoot, htmlFilePath);

if (!existsSync(resolvedFilePath)) {
    console.error(`\nError: HTML file not found at: ${resolvedFilePath}`);
    process.exit(1);
}

// ─── Credentials & config ─────────────────────────────────────────────────────

const apiKey = process.env.GHL_IDENTIFICADOR_SECRETO;

if (!apiKey) {
    console.error('\nError: GHL_IDENTIFICADOR_SECRETO not set in config/.env');
    console.error('Add the following line to your config/.env:');
    console.error('  GHL_IDENTIFICADOR_SECRETO=your_private_integration_token_here');
    console.error('\nTo get your token: GHL > Settings > Integrations > API Keys');
    process.exit(1);
}

// Load locationId — priority: config/ads-context.config.json > GHL_LOCATION_ID in .env
const configPath = resolve(projectRoot, 'config/ads-context.config.json');
let locationId;

try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const cfgLocationId = cfg?.ghl?.locationId;
    // Accept config value only if it's been set (not the placeholder)
    if (cfgLocationId && !cfgLocationId.startsWith('REEMPLAZAR')) {
        locationId = cfgLocationId;
    }
} catch {
    // config file missing or unreadable — fall through to .env fallback
}

// Fallback: read from GHL_LOCATION_ID in .env
if (!locationId) {
    locationId = process.env.GHL_LOCATION_ID;
}

// If found in .env but not in config, auto-populate config for future runs
if (locationId && process.env.GHL_LOCATION_ID === locationId) {
    try {
        const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
        if (!cfg?.ghl?.locationId || cfg.ghl.locationId.startsWith('REEMPLAZAR')) {
            cfg.ghl = cfg.ghl || {};
            cfg.ghl.locationId = locationId;
            const { writeFileSync } = await import('fs');
            writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            console.log('ℹ️  locationId auto-populated in config/ads-context.config.json from .env');
        }
    } catch {
        // Non-fatal — continue with .env value
    }
}

if (!locationId) {
    console.error('\nError: GHL Location ID not found.');
    console.error('Set it in one of these two places (either works):');
    console.error('  1. config/.env                    →  GHL_LOCATION_ID=your_location_id');
    console.error('  2. config/ads-context.config.json →  "ghl": { "locationId": "your_location_id" }');
    console.error('\nTo find your location ID: In GHL, go to your sub-account.');
    console.error('The ID is in the URL: app.gohighlevel.com/location/{locationId}/...');
    process.exit(1);
}

// ─── Read HTML file ───────────────────────────────────────────────────────────

let htmlContent;
try {
    htmlContent = readFileSync(resolvedFilePath, 'utf8');
} catch (err) {
    console.error(`\nError reading HTML file: ${err.message}`);
    process.exit(1);
}

console.log(`\nHTML file loaded: ${resolvedFilePath}`);
console.log(`Size: ${(htmlContent.length / 1024).toFixed(1)} KB`);

// ─── Build API payload ────────────────────────────────────────────────────────

const createPayload = {
    locationId,
    type: 'html',
};

const updatePayload = {
    locationId,
    name: templateName,
    subjectLine: subjectLine,
    editorType: 'html',
    editorContent: htmlContent,
};

// ─── Dry run ──────────────────────────────────────────────────────────────────

if (isDryRun) {
    console.log('\n── DRY RUN (no API call made) ──────────────────────────────');
    console.log(`\nStep 1   : POST https://services.leadconnectorhq.com/emails/builder (create blank)`);
    console.log(`Step 2   : PATCH https://services.leadconnectorhq.com/emails/builder/{id} (upload HTML)`);;
    console.log(`Location : ${locationId}`);
    console.log(`Name     : ${templateName}`);
    console.log(`Subject  : ${subjectLine}`);
    console.log(`HTML size: ${(htmlContent.length / 1024).toFixed(1)} KB`);
    console.log('\nPayload preview (first 200 chars of html):');
    console.log(JSON.stringify({ ...updatePayload, editorContent: updatePayload.editorContent.slice(0, 200) + '...' }, null, 2));
    console.log('\n✓ Dry run complete. Run without --dry-run to upload.');
    process.exit(0);
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function uploadTemplate() {
    const GHL_API_BASE = 'https://services.leadconnectorhq.com';
    const endpoint = `${GHL_API_BASE}/emails/builder`;

    console.log(`\nUploading to GHL...`);
    console.log(`Endpoint : ${endpoint}`);
    console.log(`Location : ${locationId}`);

    let response;
    try {
        // Step 1: Create blank template
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Version': '2021-07-28',
            },
            body: JSON.stringify(createPayload),
        });
    } catch (err) {
        console.error(`\nNetwork error: ${err.message}`);
        console.error('Check your internet connection and GHL API status.');
        process.exit(1);
    }

    let responseBody;
    const rawText = await response.text();

    try {
        responseBody = JSON.parse(rawText);
    } catch {
        responseBody = rawText;
    }

    // ─── Handle response ──────────────────────────────────────────────────────

    if (response.ok) {
        const templateId = responseBody?.template?.id || responseBody?.id || responseBody?._id;

        if (!templateId) {
            console.error('\n✗ Template created but no ID returned.');
            console.error(JSON.stringify(responseBody, null, 2));
            process.exit(1);
        }

        // Step 2: PATCH the template with name, subject, and HTML content
        console.log(`\nStep 2: Uploading HTML content to template ${templateId}...`);
        const patchResponse = await fetch(`${endpoint}/${templateId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Version': '2021-07-28',
            },
            body: JSON.stringify(updatePayload),
        });

        if (!patchResponse.ok) {
            const patchError = await patchResponse.text();
            console.error(`\n✗ Failed to upload HTML: ${patchResponse.status}`);
            console.error(patchError);
            process.exit(1);
        }

        console.log('\n✓ Template created successfully!\n');
        console.log('─'.repeat(50));
        console.log(`Template name : ${templateName}`);
        console.log(`Template ID   : ${templateId}`);
        console.log(`Location      : ${locationId}`);
        console.log('─'.repeat(50));
        console.log('\nNext steps in GHL:');
        console.log('  1. Go to Marketing > Emails > Templates');
        console.log(`  2. Find: "${templateName}"`);
        console.log('  3. Add to your Automation workflow');
        console.log(`\n  Template ID for reference: ${templateId}`);

    } else {
        console.error(`\n✗ API error: ${response.status} ${response.statusText}`);

        // Provide specific guidance for common errors
        if (response.status === 401) {
            console.error('\nCause: Invalid or expired API token.');
            console.error('Fix  : Regenerate your Private Integration token in GHL > Settings > Integrations > API Keys');
            console.error('       Then update GHL_IDENTIFICADOR_SECRETO in config/.env');
        } else if (response.status === 403) {
            console.error('\nCause: Token does not have permission to create templates.');
            console.error('Fix  : In GHL, ensure the API token has "Templates" scope enabled.');
        } else if (response.status === 404) {
            console.error('\nCause: Endpoint not found. The templates API path may have changed.');
            console.error('Fix  : Check current endpoint at https://highlevel.stoplight.io/docs/integrations/');
            console.error('       Update the endpoint variable in this script if needed.');
        } else if (response.status === 422) {
            console.error('\nCause: Validation error — one or more fields were rejected.');
            console.error('Response body:');
            console.error(JSON.stringify(responseBody, null, 2));
        } else {
            console.error('\nResponse body:');
            console.error(JSON.stringify(responseBody, null, 2));
        }

        process.exit(1);
    }
}

uploadTemplate();
