#!/usr/bin/env node

// Image probe for the feed-auditor images module.
//
// Two tiers, both read-only:
//   Tier 1 (whole feed)  — fetch each product's image_link with a ranged GET and parse the
//                          image header (PNG/JPEG/WebP/GIF). Flags broken links, undersized
//                          images, and oversized files. No full downloads, concurrency-limited.
//   Tier 2 (top N)       — enabled with --visual. The feed-auditor skill always runs this
//                          (Claude invokes `probe-images.js --visual` without asking the user).
//                          Rank products by the business target discovered from settings
//                          (ROAS -> conversion value; CPA -> conversions; fallback cost, then
//                          impressions), download the top N full images locally, and emit a
//                          visual queue for Claude to inspect (watermark/background/composition).
//
// Outputs:
//   context/feed/cache/image-probe.json          — Tier 1 results, keyed by product_id
//   context/feed/cache/images/<product_id>.<ext> — Tier 2 downloaded images (top N, when requested)
//   context/feed/cache/image-visual-queue.json   — Tier 2 manifest (local paths + metrics, when requested)
//
// This script never mutates Merchant Center or Google Ads. It only fetches image URLs the
// feed already exposes. If it is not run, images.js degrades to metadata-only behavior.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  aggregatePerformanceRows,
  getFeedAuditSettings,
  loadJson,
  outputPaths,
  parseArgs,
  readCsv,
} from './lib/feed-auditor-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Google Merchant image requirements (Data Spec). Hard min blocks; the rest are quality bands.
const MIN_DIM = 100;            // non-apparel hard minimum (px)
const MIN_DIM_APPAREL = 250;    // apparel hard minimum (px)
const RECOMMENDED_DIM = 800;    // Google recommended minimum (px)
const IDEAL_DIM = 1500;         // Data Spec ideal (px)
const MAX_BYTES = 16 * 1024 * 1024; // 16 MB hard cap (Google rejects above)
const MAX_MEGAPIXELS = 64;          // 64 MP hard cap (Google rejects above)

const PROBE_BYTES = 131072;     // read at most 128 KB per image to find the header
const REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TOP_N = 15;
const ADDITIONAL_IMAGE_SAMPLE = 2;  // additional images downloaded per Tier-2 product (2 if available, else fewer)

function resolveProjectRoot(startDir) {
  let current = resolve(startDir);
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'context/feed/cache'))) return current;
    current = dirname(current);
  }
  throw new Error('Could not find PPCOS client root (no context/feed/cache). Run pull-data.js first.');
}

// --- Image header parsing (dependency-free) ---------------------------------
// Reads width/height from the first bytes of common Shopping image formats.

function readUInt16BE(buf, off) { return (buf[off] << 8) | buf[off + 1]; }
function readUInt16LE(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readUInt24LE(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16); }
function readUInt32BE(buf, off) { return (buf[off] * 0x1000000) + ((buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]); }

function parseDimensions(buf) {
  if (!buf || buf.length < 16) return null;

  // PNG: 8-byte signature, then IHDR with width (16..20) / height (20..24) big-endian.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { format: 'png', width: readUInt32BE(buf, 16), height: readUInt32BE(buf, 20) };
  }

  // GIF: "GIF8", width/height little-endian at 6 / 8.
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { format: 'gif', width: readUInt16LE(buf, 6), height: readUInt16LE(buf, 8) };
  }

  // WebP: "RIFF"...."WEBP" then a VP8 / VP8L / VP8X chunk.
  if (buf.length >= 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === 'VP8X') {
      return { format: 'webp', width: readUInt24LE(buf, 24) + 1, height: readUInt24LE(buf, 27) + 1 };
    }
    if (chunk === 'VP8 ') {
      // Lossy: 16-bit dimensions (14 bits used) after the 3-byte frame tag + start code.
      return { format: 'webp', width: readUInt16LE(buf, 26) & 0x3fff, height: readUInt16LE(buf, 28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const b = buf; const o = 21; // after 'VP8L' + size + 0x2f signature
      const bits = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { format: 'webp', width: null, height: null };
  }

  // JPEG: scan segment markers for an SOF (start-of-frame) which carries the dimensions.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry frame dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', height: readUInt16BE(buf, off + 5), width: readUInt16BE(buf, off + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        off += 2; continue;
      }
      const segLen = readUInt16BE(buf, off + 2);
      if (segLen < 2) break;
      off += 2 + segLen;
    }
    return { format: 'jpeg', width: null, height: null };
  }

  return null;
}

// --- Fetch helpers ----------------------------------------------------------

async function fetchHeaderBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}`, 'User-Agent': 'PPCOS-FeedAuditor/1.0 (+image-probe)' },
    });
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    // content-length is the chunk size on 206; content-range total is the real file size.
    const contentRange = response.headers.get('content-range') || '';
    const rangeTotal = /\/(\d+)\s*$/.exec(contentRange);
    const declaredBytes = rangeTotal ? Number(rangeTotal[1]) : Number(response.headers.get('content-length') || 0) || null;

    if (status >= 400 || !response.body) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return { status, contentType, declaredBytes, buffer: null };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (received < PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    return { status, contentType, declaredBytes, buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
  } finally {
    clearTimeout(timer);
  }
}

function isApparel(product) {
  const hay = `${product.google_product_category || ''} ${product.product_type || ''}`.toLowerCase();
  if (/apparel|clothing|shoe|footwear|dress|shirt|trouser|jeans|jacket|t-shirt|sneaker/.test(hay)) return true;
  // Soft signal: apparel-only attributes are populated.
  return Boolean((product.gender && product.gender.length) && (product.size && product.size.length));
}

function evaluateProbe(product, fetched) {
  const findings = [];
  const apparel = isApparel(product);
  const hardMin = apparel ? MIN_DIM_APPAREL : MIN_DIM;

  if (!fetched || fetched.status >= 400 || fetched.status === 0) {
    findings.push({ code: 'broken_image_url', severity: 'high', message: `image_link returned HTTP ${fetched ? fetched.status : 'no-response'} (image cannot be crawled)` });
    return { findings, apparel };
  }
  if (fetched.contentType && !/^image\//i.test(fetched.contentType)) {
    findings.push({ code: 'not_an_image', severity: 'high', message: `image_link content-type is "${fetched.contentType}", not an image` });
  }

  const dims = parseDimensions(fetched.buffer);
  const width = dims?.width || null;
  const height = dims?.height || null;

  if (fetched.declaredBytes && fetched.declaredBytes > MAX_BYTES) {
    findings.push({ code: 'file_too_large', severity: 'high', message: `image is ${(fetched.declaredBytes / 1048576).toFixed(1)} MB (>16 MB Google limit)` });
  }

  if (width && height) {
    const megapixels = (width * height) / 1_000_000;
    if (megapixels > MAX_MEGAPIXELS) {
      findings.push({ code: 'too_many_megapixels', severity: 'high', message: `image is ${megapixels.toFixed(1)} MP (>64 MP Google limit)` });
    }
    if (width < hardMin || height < hardMin) {
      findings.push({ code: 'below_minimum_size', severity: 'high', message: `image is ${width}x${height}px, below the ${hardMin}x${hardMin}px ${apparel ? 'apparel ' : ''}minimum (disapproved)` });
    } else if (width < RECOMMENDED_DIM || height < RECOMMENDED_DIM) {
      findings.push({ code: 'below_recommended_size', severity: 'medium', message: `image is ${width}x${height}px, below the recommended 800x800px` });
    } else if (width < IDEAL_DIM || height < IDEAL_DIM) {
      findings.push({ code: 'below_ideal_size', severity: 'low', message: `image is ${width}x${height}px, below the Data-Spec ideal 1500x1500px` });
    }
  } else if (fetched.contentType && /^image\//i.test(fetched.contentType)) {
    findings.push({ code: 'dimensions_unreadable', severity: 'low', message: 'image responded but dimensions could not be read from the header (unsupported/truncated format)' });
  }

  return { findings, width, height, megapixels: width && height ? Number(((width * height) / 1_000_000).toFixed(2)) : null, bytes: fetched.declaredBytes || null, apparel };
}

// --- Tier 2 ranking ---------------------------------------------------------

function rankByBusinessTarget(products, perfByProduct, settings) {
  const metric = settings.performanceLabelMetric;
  const preferRoas = metric === 'roas' || (metric === 'auto' && settings.targetRoas && !settings.targetCpa);
  const preferCpa = metric === 'cpa' || (metric === 'auto' && settings.targetCpa && !settings.targetRoas);

  const enriched = products.map((product) => {
    const perf = perfByProduct.get(product.product_id) || { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 };
    return { product, perf };
  });

  // Decide the ranking key. Fall through when the preferred signal is entirely absent.
  const totalConvValue = enriched.reduce((s, e) => s + (e.perf.conversion_value || 0), 0);
  const totalConversions = enriched.reduce((s, e) => s + (e.perf.conversions || 0), 0);
  const totalCost = enriched.reduce((s, e) => s + (e.perf.cost || 0), 0);

  let rankKey = 'impressions';
  let rankBasis = 'impressions (no spend/conversion signal in the period)';
  if (preferRoas && totalConvValue > 0) { rankKey = 'conversion_value'; rankBasis = 'conversion value (ROAS target)'; }
  else if (preferCpa && totalConversions > 0) { rankKey = 'conversions'; rankBasis = 'conversions (CPA target)'; }
  else if (totalConvValue > 0) { rankKey = 'conversion_value'; rankBasis = 'conversion value'; }
  else if (totalConversions > 0) { rankKey = 'conversions'; rankBasis = 'conversions'; }
  else if (totalCost > 0) { rankKey = 'cost'; rankBasis = 'cost (no conversions in the period)'; }

  enriched.sort((a, b) => (b.perf[rankKey] || 0) - (a.perf[rankKey] || 0) || (b.perf.impressions || 0) - (a.perf.impressions || 0));
  return { ranked: enriched, rankKey, rankBasis };
}

// --- Concurrency pool -------------------------------------------------------

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { error: error.message }; }
    }
  });
  await Promise.all(runners);
  return results;
}

async function downloadFull(url, destPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 2);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'PPCOS-FeedAuditor/1.0 (+image-probe)' } });
    if (!response.ok) return { ok: false, status: response.status };
    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(destPath, Buffer.from(arrayBuffer));
    return { ok: true, status: response.status, bytes: arrayBuffer.byteLength };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function extForContentType(ct, url) {
  if (/jpeg|jpg/i.test(ct)) return '.jpg';
  if (/png/i.test(ct)) return '.png';
  if (/webp/i.test(ct)) return '.webp';
  if (/gif/i.test(ct)) return '.gif';
  const fromUrl = extname((url.split('?')[0] || '')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromUrl) ? fromUrl : '.img';
}

function safeName(productId) {
  return String(productId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot(args['client-root'] || process.cwd());
  const paths = outputPaths(projectRoot);
  const concurrency = Number.parseInt(args.concurrency || DEFAULT_CONCURRENCY, 10);
  const topN = Number.parseInt(args.top || DEFAULT_TOP_N, 10);
  const tier2 = Boolean(args.visual || args['tier2'] || args['visual-review']) && !args['no-visual'];

  if (!existsSync(paths.merchantCacheJson)) {
    throw new Error('No normalized product cache found. Run pull-data.js first.');
  }
  const products = loadJson(paths.merchantCacheJson, 'missing-merchant-cache');
  const allWithImages = products.filter((p) => p.image_link);
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const withImages = limit && limit < allWithImages.length ? allWithImages.slice(0, limit) : allWithImages;
  const capped = withImages.length < allWithImages.length;

  const configPath = resolve(projectRoot, 'config/ads-context.config.json');
  const config = existsSync(configPath) ? loadJson(configPath, 'missing-config') : {};
  const pullSummary = existsSync(paths.summaryJson) ? loadJson(paths.summaryJson, 'missing-pull-summary') : {};
  const settings = { ...(pullSummary.feed_audit_settings || {}), ...getFeedAuditSettings(config, {}) };

  console.log('\nFeed Auditor - Image Probe');
  console.log(`Products with image_link: ${allWithImages.length}/${products.length}`);
  if (capped) console.log(`NOTE: --limit ${limit} set; probing only ${withImages.length} of ${allWithImages.length} (coverage is NOT complete).`);
  console.log(`Tier 1 (whole feed) concurrency=${concurrency}; Tier 2 visual=${tier2 ? `top ${topN}` : 'off (pass --visual after confirmation)'}\n`);

  // --- Tier 1: probe every primary image ---
  console.log('Tier 1: probing primary image headers...');
  const probeResults = await pool(withImages, concurrency, async (product) => {
    let fetched = null;
    try { fetched = await fetchHeaderBytes(product.image_link); }
    catch (error) { fetched = { status: 0, contentType: '', declaredBytes: null, buffer: null, error: error.message }; }
    const evald = evaluateProbe(product, fetched);
    return {
      product_id: product.product_id,
      title: product.title,
      image_link: product.image_link,
      feed_label: product.feed_label,
      target_country: product.target_country,
      language: product.language,
      http_status: fetched ? fetched.status : 0,
      content_type: fetched ? fetched.contentType : '',
      bytes: evald.bytes || (fetched ? fetched.declaredBytes : null) || null,
      width: evald.width || null,
      height: evald.height || null,
      megapixels: evald.megapixels || null,
      apparel: evald.apparel,
      findings: evald.findings,
    };
  });

  const flagged = probeResults.filter((r) => r.findings.length > 0);
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const r of flagged) for (const f of r.findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;

  const probeOut = {
    generated_at: new Date().toISOString(),
    tier: 1,
    probed: probeResults.length,
    total_with_image: allWithImages.length,
    coverage_complete: !capped,
    flagged: flagged.length,
    findings_by_severity: bySeverity,
    thresholds: { min: MIN_DIM, min_apparel: MIN_DIM_APPAREL, recommended: RECOMMENDED_DIM, ideal: IDEAL_DIM, max_bytes: MAX_BYTES, max_megapixels: MAX_MEGAPIXELS },
    results: probeResults,
  };
  writeFileSync(paths.imageProbeJson, JSON.stringify(probeOut, null, 2));
  console.log(`  Probed ${probeResults.length}; flagged ${flagged.length} (high=${bySeverity.high || 0}, medium=${bySeverity.medium || 0}, low=${bySeverity.low || 0}).`);
  console.log(`  Wrote ${paths.imageProbeJson.replace(projectRoot + '/', '')}`);

  // --- Tier 2: download top N by business target for a visual pass ---
  let visualOut = null;
  if (tier2 && allWithImages.length > 0) {
    console.log(`\nTier 2: ranking products by business target and downloading top ${topN}...`);
    const perfRows = readCsv(resolve(paths.cacheDir, 'google-ads-shopping-performance.csv'));
    const perfByProduct = aggregatePerformanceRows(perfRows);
    const { ranked, rankBasis } = rankByBusinessTarget(allWithImages, perfByProduct, settings);
    const top = ranked.slice(0, topN);

    const imagesDir = resolve(paths.cacheDir, 'images');
    mkdirSync(imagesDir, { recursive: true });

    const probeById = new Map(probeResults.map((r) => [r.product_id, r]));
    const items = await pool(top, Math.min(concurrency, 6), async ({ product, perf }) => {
      const probe = probeById.get(product.product_id) || {};
      const ext = extForContentType(probe.content_type || '', product.image_link);
      const fileName = `${safeName(product.product_id)}${ext}`;
      const destPath = resolve(imagesDir, fileName);
      const dl = await downloadFull(product.image_link, destPath);

      // Lifestyle image (when present): a second, context/scene asset that surfaces on browse-led
      // placements (Demand Gen, YouTube, PMax). Download it alongside the primary so Claude can rate
      // how well it presents the product for the business case. The Tier-1 probe only fetched the
      // primary header, so derive the extension from the lifestyle URL itself.
      let lifestyle = null;
      if (product.lifestyle_image_link) {
        const lifeExt = extForContentType('', product.lifestyle_image_link);
        const lifeName = `${safeName(product.product_id)}-lifestyle${lifeExt}`;
        const lifeDest = resolve(imagesDir, lifeName);
        const lifeDl = await downloadFull(product.lifestyle_image_link, lifeDest);
        lifestyle = {
          image_link: product.lifestyle_image_link,
          local_path: lifeDl.ok ? `context/feed/cache/images/${lifeName}` : null,
          downloaded: lifeDl.ok,
          download_error: lifeDl.ok ? null : (lifeDl.error || `HTTP ${lifeDl.status}`),
        };
      }

      // Additional images: download up to ADDITIONAL_IMAGE_SAMPLE per product (2 when available,
      // else whatever exists) so Claude can judge the gallery, not just the hero shot. Stored
      // pipe-joined in the normalized cache.
      const additionalUrls = String(product.additional_image_links || '')
        .split(' | ').map((u) => u.trim()).filter(Boolean)
        .slice(0, ADDITIONAL_IMAGE_SAMPLE);
      const additional = [];
      for (let i = 0; i < additionalUrls.length; i++) {
        const url = additionalUrls[i];
        const addExt = extForContentType('', url);
        const addName = `${safeName(product.product_id)}-additional-${i + 1}${addExt}`;
        const addDest = resolve(imagesDir, addName);
        const addDl = await downloadFull(url, addDest);
        additional.push({
          image_link: url,
          local_path: addDl.ok ? `context/feed/cache/images/${addName}` : null,
          downloaded: addDl.ok,
          download_error: addDl.ok ? null : (addDl.error || `HTTP ${addDl.status}`),
        });
      }

      return {
        product_id: product.product_id,
        title: product.title,
        image_link: product.image_link,
        local_path: dl.ok ? `context/feed/cache/images/${fileName}` : null,
        downloaded: dl.ok,
        download_error: dl.ok ? null : (dl.error || `HTTP ${dl.status}`),
        lifestyle,
        additional,
        performance: {
          impressions: perf.impressions, clicks: perf.clicks,
          cost: Number((perf.cost || 0).toFixed(2)), conversions: perf.conversions,
          conversion_value: Number((perf.conversion_value || 0).toFixed(2)),
        },
        tier1: { width: probe.width || null, height: probe.height || null, findings: probe.findings || [] },
      };
    });

    const downloaded = items.filter((i) => i.downloaded).length;
    const lifestyleDownloaded = items.filter((i) => i.lifestyle && i.lifestyle.downloaded).length;
    const additionalDownloaded = items.reduce((s, i) => s + (i.additional || []).filter((a) => a.downloaded).length, 0);
    visualOut = {
      generated_at: new Date().toISOString(),
      tier: 2,
      ranking_basis: rankBasis,
      requested: topN,
      downloaded,
      lifestyle_downloaded: lifestyleDownloaded,
      additional_downloaded: additionalDownloaded,
      additional_per_product: ADDITIONAL_IMAGE_SAMPLE,
      instructions: 'Claude: Read each item\'s local_path (primary image) and assess visual quality — promotional text/watermarks (policy violation), non-white/cluttered background, frame fill (product too small/cropped), multiple products in a single-product image, blur/low quality. When an item has lifestyle.local_path, ALSO read it and rate how well the lifestyle image sells the product for THIS business: relevance to the target customer/use case (from business.md), aspirational/in-context staging, clarity of the hero product, and whether it complements (not duplicates) the primary white-background shot. When an item has an additional[] array, read those images too and judge the gallery: do the extra angles/details add buying information (scale, back, texture, in-use) or just repeat the hero? Flag any policy issues (watermark/promo text) in additional images. Fold all of it into the images advisory brief. Never claim visual quality for products NOT in this list.',
      items,
    };
    writeFileSync(paths.imageVisualQueueJson, JSON.stringify(visualOut, null, 2));
    console.log(`  Ranked by: ${rankBasis}. Downloaded ${downloaded}/${top.length} primary + ${lifestyleDownloaded} lifestyle + ${additionalDownloaded} additional to context/feed/cache/images/.`);
    console.log(`  Wrote ${paths.imageVisualQueueJson.replace(projectRoot + '/', '')}`);
  }

  console.log('\nDone.');
  console.log('\n__RESULTS_JSON__');
  console.log(JSON.stringify({
    tier1: { probed: probeOut.probed, flagged: probeOut.flagged, findings_by_severity: bySeverity },
    tier2: visualOut ? { ranking_basis: visualOut.ranking_basis, downloaded: visualOut.downloaded, lifestyle_downloaded: visualOut.lifestyle_downloaded, additional_downloaded: visualOut.additional_downloaded, requested: visualOut.requested } : null,
  }));
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
