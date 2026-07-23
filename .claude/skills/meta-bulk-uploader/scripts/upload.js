#!/usr/bin/env node

/**
 * Meta Bulk Uploader — Create campaigns, ad sets, and ads via Meta Marketing API
 *
 * Based on SOP-027: Configurar Campañas de Meta Ads
 * Structure: CBO campaign → Control adset (active) + Test adset (paused) → ads
 *
 * Modes:
 *   full-setup  Create CBO campaign + Control/Test ad sets + ads
 *   ads-only    Upload ads to an existing ad set
 *
 * Usage:
 *   node upload.js --mode=full-setup --input=path/to/brief.json [--dry-run]
 *   node upload.js --mode=ads-only   --input=path/to/brief.json [--dry-run]
 *
 * Input brief: JSON file (see references/brief-template-*.json)
 * Output: created/meta-ads/TIMESTAMP_upload-results.json
 *
 * Credentials: loaded from config/.env
 *   META_ACCESS_TOKEN     — System User token with ads_management permission
 *   META_AD_ACCOUNT_ID    — Format: act_XXXXXXXXXXXXXXXXX
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Walk up from script location to find project root (has config/ dir)
let projectRoot = __dirname;
while (projectRoot !== resolve(projectRoot, '..') && !existsSync(resolve(projectRoot, 'config'))) {
    projectRoot = resolve(projectRoot, '..');
}
config({ path: resolve(projectRoot, 'config/.env') });

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ENV_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ENV_PIXEL_ID = process.env.META_PIXEL_ID;
const ENV_INSTAGRAM_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// SOP-027 standard UTM template (Meta dynamic macros)
const UTM_TEMPLATE =
    'utm_source=fb_ad' +
    '&utm_medium={{adset.name}}' +
    '&utm_campaign={{campaign.name}}' +
    '&utm_content={{ad.name}}' +
    '&campaign_id={{campaign.id}}' +
    '&ad_id={{ad.id}}' +
    '&adset_id={{adset.id}}';

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, arg) => {
    const eq = arg.indexOf('=');
    if (eq > -1) {
        acc[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (arg.startsWith('--')) {
        acc[arg.slice(2)] = true;
    }
    return acc;
}, {});

const mode = args.mode;
const inputPath = args.input;
const dryRun = args['dry-run'] === true;

if (!mode || !inputPath) {
    console.error('Usage: node upload.js --mode=<full-setup|ads-only> --input=<path/to/brief.json> [--dry-run]');
    console.error('');
    console.error('Modes:');
    console.error('  full-setup  Create CBO campaign + Control/Test ad sets + all ads');
    console.error('  ads-only    Add ads to an existing ad set');
    process.exit(1);
}

if (!['full-setup', 'ads-only'].includes(mode)) {
    console.error(`Unknown mode: "${mode}". Use full-setup or ads-only.`);
    process.exit(1);
}

if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
    console.error('Error: Missing Meta credentials in config/.env');
    console.error('Required:');
    console.error('  META_ACCESS_TOKEN     System User token (ads_management permission)');
    console.error('  META_AD_ACCOUNT_ID    Format: act_XXXXXXXXXXXXXXXXX');
    process.exit(1);
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────

let dryRunSeq = 0;

async function apiPost(endpoint, body) {
    if (dryRun) {
        const fakeId = `dry-${++dryRunSeq}`;
        console.log(`    [DRY RUN] POST ${endpoint} → ${fakeId}`);
        return { id: fakeId };
    }

    const params = new URLSearchParams({ ...body, access_token: ACCESS_TOKEN });
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const data = await res.json();
    if (data.error) {
        console.error('  Full API error:', JSON.stringify(data.error, null, 2));
        const msg = `[${data.error.code}] ${data.error.message}`;
        if (data.error.error_subcode) {
            throw new Error(`${msg} (subcode: ${data.error.error_subcode})`);
        }
        throw new Error(msg);
    }
    return data;
}

// Upload image file → returns Meta image hash
async function uploadImage(imagePath) {
    const absPath = resolve(projectRoot, imagePath);
    if (!existsSync(absPath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    if (dryRun) {
        console.log(`    [DRY RUN] Upload image: ${imagePath} → dry-hash-${dryRunSeq + 1}`);
        return `dry-hash-${++dryRunSeq}`;
    }

    const filename = basename(absPath);
    const fileBytes = readFileSync(absPath);
    const blob = new Blob([fileBytes]);

    const formData = new FormData();
    formData.append(filename, blob, filename);
    formData.append('access_token', ACCESS_TOKEN);

    const res = await fetch(`${BASE_URL}/${AD_ACCOUNT_ID}/adimages`, {
        method: 'POST',
        body: formData,
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`Image upload failed: ${data.error.message}`);
    }

    const hash = data.images?.[filename]?.hash;
    if (!hash) {
        throw new Error(`No hash returned for uploaded image: ${filename}`);
    }

    return hash;
}

// ─── ENTITY CREATORS ─────────────────────────────────────────────────────────

async function createCampaign(cfg) {
    console.log(`\nCampaign: "${cfg.name}"`);

    // CLP has no sub-units — Meta API expects the value as-is (no × 100 multiplier).
    // Other currencies with sub-units (USD, EUR) would need × 100, but NOT CLP.
    const dailyBudget = Math.round(cfg.daily_budget_clp || 0);
    if (!dailyBudget) throw new Error('campaign.daily_budget_clp is required');

    const result = await apiPost(`/${AD_ACCOUNT_ID}/campaigns`, {
        name: cfg.name,
        objective: 'OUTCOME_LEADS',
        special_ad_categories: '[]',
        buying_type: 'AUCTION',
        daily_budget: dailyBudget,    // CBO: budget set at campaign level
        bid_strategy: cfg.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
        ...(cfg.bid_amount ? { bid_amount: Math.round(cfg.bid_amount) } : {}),
        status: cfg.status || 'PAUSED',
    });

    console.log(`  → Campaign ID: ${result.id}`);
    return result.id;
}

async function createAdSet(campaignId, name, cfg, status) {
    console.log(`\nAd Set: "${name}" [${status}]`);

    const pixel_id = cfg.pixel_id || ENV_PIXEL_ID;
    const page_id = cfg.page_id || ENV_PAGE_ID;
    const instagram_account_id = cfg.instagram_account_id || ENV_INSTAGRAM_ID || null;

    if (!pixel_id) throw new Error('adset_config.pixel_id is required (or set META_PIXEL_ID in .env)');
    if (!page_id) throw new Error('adset_config.page_id is required (or set META_PAGE_ID in .env)');

    const targeting = {
        geo_locations: { countries: [cfg.geo_country || 'CL'] },
        age_min: cfg.age_min || 25,
        age_max: cfg.age_max || 65,
        // No interests = Broad (SOP-027: "creative is targeting")
    };

    const promotedObject = {
        pixel_id,
        page_id,
        custom_event_type: cfg.conversion_event || 'LEAD',
    };

    const result = await apiPost(`/${AD_ACCOUNT_ID}/adsets`, {
        name,
        campaign_id: campaignId,
        optimization_goal: 'OFFSITE_CONVERSIONS',
        billing_event: 'IMPRESSIONS',
        promoted_object: JSON.stringify(promotedObject),
        targeting: JSON.stringify(targeting),
        status,
    });

    console.log(`  → Ad Set ID: ${result.id}`);
    return result.id;
}

// Build asset_feed_spec for multi-format image ads (e.g. 9:16 + 4:5 in one ad)
function buildAssetFeedSpec(ad, shared) {
    const { destination_url } = shared;
    const cta = ad.cta || 'LEARN_MORE';

    const spec = {
        ad_formats: ['SINGLE_IMAGE'],
        images: ad.image_hashes.map(hash => ({ hash })),
        bodies: [{ text: ad.primary_text }],
        titles: [{ text: ad.headline }],
        call_to_action_types: [cta],
        link_urls: [{ website_url: destination_url, url_tags: UTM_TEMPLATE }],
    };

    if (ad.description) {
        spec.descriptions = [{ text: ad.description }];
    }

    return spec;
}

// Build object_story_spec for single-format ads (video or single image)
function buildObjectStorySpec(ad, shared) {
    const { page_id, instagram_account_id, destination_url } = shared;
    const cta = ad.cta || 'LEARN_MORE';

    let spec;

    if (ad.format === 'video') {
        if (!ad.video_id) throw new Error(`Ad "${ad.name}" has format=video but no video_id`);
        spec = {
            page_id,
            video_data: {
                video_id: ad.video_id,
                message: ad.primary_text,
                title: ad.headline,
                description: ad.description || '',
                call_to_action: {
                    type: cta,
                    value: { link: destination_url },
                },
                url_tags: UTM_TEMPLATE,
            },
        };
    } else {
        // single image
        if (!ad.image_hash) throw new Error(`Ad "${ad.name}" has no image_hash (or image_path / image_hashes)`);
        const linkData = {
            link: destination_url,
            message: ad.primary_text,
            name: ad.headline,
            call_to_action: JSON.stringify({ type: cta }),
            image_hash: ad.image_hash,
        };
        if (ad.description) linkData.description = ad.description;

        spec = { page_id, link_data: linkData };
    }

    if (instagram_account_id) {
        spec.instagram_actor_id = instagram_account_id;
    }

    return spec;
}

async function createCreative(adName, ad, shared) {
    const { page_id, instagram_account_id } = shared;

    // Multi-format image ad (9:16 + 4:5 as a single ad via asset_feed_spec)
    if (Array.isArray(ad.image_hashes) && ad.image_hashes.length > 0) {
        const assetFeedSpec = buildAssetFeedSpec(ad, shared);
        const body = {
            name: `${adName} — Creative`,
            asset_feed_spec: JSON.stringify(assetFeedSpec),
            object_type: 'SHARE',
        };
        if (page_id) body.page_id = page_id;
        if (instagram_account_id) body.instagram_actor_id = instagram_account_id;

        const result = await apiPost(`/${AD_ACCOUNT_ID}/adcreatives`, body);
        console.log(`    Creative ID: ${result.id} (multi-format: ${ad.image_hashes.length} images)`);
        return result.id;
    }

    // Single-format (video or single image)
    const objectStorySpec = buildObjectStorySpec(ad, shared);
    const result = await apiPost(`/${AD_ACCOUNT_ID}/adcreatives`, {
        name: `${adName} — Creative`,
        object_story_spec: JSON.stringify(objectStorySpec),
        url_tags: UTM_TEMPLATE,
    });

    console.log(`    Creative ID: ${result.id}`);
    return result.id;
}

async function createAd(name, adsetId, creativeId) {
    const result = await apiPost(`/${AD_ACCOUNT_ID}/ads`, {
        name,
        adset_id: adsetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'PAUSED',
    });

    console.log(`    Ad ID: ${result.id}`);
    return result.id;
}

// ─── AD EXPANSION ─────────────────────────────────────────────────────────────
// If an ad has primary_texts[] (multiple variants), expand into multiple ads

function expandAds(brief) {
    const expanded = [];

    for (const ad of brief.ads || []) {
        // Support primary_texts[] as shorthand for multiple copy variants
        if (Array.isArray(ad.primary_texts) && ad.primary_texts.length > 0) {
            ad.primary_texts.forEach((text, i) => {
                expanded.push({
                    ...ad,
                    name: ad.primary_texts.length > 1 ? `${ad.name} — v${i + 1}` : ad.name,
                    primary_text: text,
                    primary_texts: undefined,
                });
            });
        } else {
            if (!ad.primary_text && !ad.primary_texts) {
                throw new Error(`Ad "${ad.name}" is missing primary_text`);
            }
            expanded.push({ ...ad });
        }
    }

    return expanded;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=== Meta Bulk Uploader ===');
    console.log(`Mode:    ${mode}`);
    console.log(`Input:   ${inputPath}`);
    if (dryRun) console.log('*** DRY RUN — no API calls will be made ***');
    console.log('');

    const absInput = resolve(projectRoot, inputPath);
    if (!existsSync(absInput)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const brief = JSON.parse(readFileSync(absInput, 'utf8'));

    // Validate mode matches brief
    if (brief.mode && brief.mode !== mode) {
        console.warn(`Warning: brief.mode="${brief.mode}" but CLI mode="${mode}". Using CLI mode.`);
    }

    const results = {
        mode,
        input: inputPath,
        dry_run: dryRun,
        created_at: new Date().toISOString(),
        campaign_id: null,
        adsets: {},
        ads: [],
        errors: [],
    };

    let adsetMap = {};  // key → adset_id
    let shared = {};    // page_id, instagram_account_id, destination_url

    // ── Full setup mode ────────────────────────────────────────────────────────

    if (mode === 'full-setup') {
        const cfg = brief.adset_config;
        if (!cfg) throw new Error('brief.adset_config is required for full-setup mode');

        shared = {
            page_id: cfg.page_id || ENV_PAGE_ID,
            instagram_account_id: null,   // skip Instagram — connect manually in Ads Manager
            destination_url: cfg.destination_url,
        };

        // 1. Campaign (CBO budget at campaign level) — skip if id already provided
        let campaignId;
        if (brief.campaign.id) {
            campaignId = brief.campaign.id;
            console.log(`\nCampaign: reusing existing ID ${campaignId}`);
        } else {
            campaignId = await createCampaign(brief.campaign);
        }
        results.campaign_id = campaignId;

        // 2. Create ad sets from brief.adsets[] array
        if (!brief.adsets || brief.adsets.length === 0) {
            throw new Error('brief.adsets must be a non-empty array of {key, name, status}');
        }
        for (const adset of brief.adsets) {
            if (!adset.key) throw new Error(`Each adset must have a "key" field (used in ads to reference it)`);
            const adsetId = await createAdSet(campaignId, adset.name, cfg, adset.status || 'PAUSED');
            adsetMap[adset.key] = adsetId;
            results.adsets[adset.key] = adsetId;
        }
    }

    // ── Ads-only mode ──────────────────────────────────────────────────────────

    if (mode === 'ads-only') {
        if (!brief.adset_id) throw new Error('brief.adset_id is required for ads-only mode');

        adsetMap.default = brief.adset_id;
        shared = {
            page_id: brief.page_id || ENV_PAGE_ID,
            instagram_account_id: null,   // skip Instagram — connect manually in Ads Manager
            destination_url: brief.destination_url,
        };

        console.log(`Target ad set: ${brief.adset_id}`);
    }

    // Validate shared fields
    if (!shared.page_id) throw new Error('page_id is required');
    if (!shared.destination_url) throw new Error('destination_url is required');

    // ── Ads ────────────────────────────────────────────────────────────────────

    const ads = expandAds(brief);
    console.log(`\nCreating ${ads.length} ad(s)...`);

    for (const ad of ads) {
        try {
            // Multi-format: upload array of image paths → image_hashes[]
            if (Array.isArray(ad.image_paths) && ad.image_paths.length > 0 && !ad.image_hashes) {
                console.log(`\nUploading ${ad.image_paths.length} images for: ${ad.name}`);
                ad.image_hashes = [];
                for (const imgPath of ad.image_paths) {
                    const hash = await uploadImage(imgPath);
                    ad.image_hashes.push(hash);
                    console.log(`  ${imgPath} → ${hash}`);
                }
            }

            // Single image: upload path → image_hash
            if (ad.image_path && !ad.image_hash) {
                console.log(`\nUploading image: ${ad.image_path}`);
                ad.image_hash = await uploadImage(ad.image_path);
                console.log(`  Hash: ${ad.image_hash}`);
            }

            // Determine target adset
            const adsetKey = mode === 'ads-only' ? 'default' : (ad.adset || 'control');
            const adsetId = adsetMap[adsetKey];
            if (!adsetId) {
                throw new Error(`Ad set key "${adsetKey}" not found. Valid keys: ${Object.keys(adsetMap).join(', ')}`);
            }

            console.log(`\nAd: "${ad.name}" → ${adsetKey}`);

            const creativeId = await createCreative(ad.name, ad, shared);
            const adId = await createAd(ad.name, adsetId, creativeId);

            results.ads.push({
                name: ad.name,
                adset: adsetKey,
                creative_id: creativeId,
                ad_id: adId,
            });
        } catch (err) {
            console.error(`  ✗ Error on "${ad.name}": ${err.message}`);
            results.errors.push({ name: ad.name, error: err.message });
        }
    }

    // ── Save results ───────────────────────────────────────────────────────────

    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const outDir = resolve(projectRoot, 'created/meta-ads');
    mkdirSync(outDir, { recursive: true });
    const outFile = `created/meta-ads/${ts}_upload-results.json`;
    writeFileSync(resolve(projectRoot, outFile), JSON.stringify(results, null, 2), 'utf8');

    // ── Summary ────────────────────────────────────────────────────────────────

    console.log('\n=== Summary ===');
    if (results.campaign_id) {
        console.log(`Campaign ID:  ${results.campaign_id}`);
        for (const [key, id] of Object.entries(results.adsets)) {
            console.log(`  Adset [${key}]: ${id}`);
        }
    }
    console.log(`Ads OK:      ${results.ads.length}`);
    if (results.errors.length) {
        console.log(`Ads failed:  ${results.errors.length}`);
        results.errors.forEach(e => console.log(`  ✗ ${e.name}: ${e.error}`));
    }
    console.log(`Results:     ${outFile}`);

    if (!dryRun && mode === 'full-setup') {
        console.log('');
        console.log('All entities created as PAUSED.');
        console.log('Next: review in Ads Manager, then activate the Control ad set to launch.');
    }

    if (results.errors.length > 0 && results.ads.length === 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
});
