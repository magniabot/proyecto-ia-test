// Worklist builder for the small-attributes action.
//
// Universe = the FULL normalized product cache (including Merchant-flagged/error products, which the
// auditor's completeness module excludes — that exclusion is exactly why we cannot consume
// completeness-queue.csv as the worklist). Relevance + missingness come from the imported auditor
// engine (relevance.js). The auditor's per-module queues, when present, are used only to ENRICH
// items with confidence/fixability tags — never to gate inclusion.

import { existsSync } from 'fs';
import { readCsv } from '../feed-optimizer-core.js';
import { buildRelevanceMap } from './relevance.js';

// Minimal product payload the LLM needs (keeps token/image cost predictable; no secrets).
function itemPayload(product, attrs) {
  return {
    product_id: product.product_id,
    feed_label: product.feed_label || '',
    target_country: product.target_country || '',
    language: product.language || '',
    title: product.title || '',
    description: product.description || '',
    image_link: product.image_link || '',
    gpc_path_en: product.gpc_path_en || '',
    link: product.link || '',
    product_status: product.product_status || '',
    attrs, // [{ attr, feed_name, latitude, tier, reason, fixability_hint }]
  };
}

export function verticalOf(item) {
  const path = String(item.gpc_path_en || '').trim();
  if (path) return path.split('>')[0].trim();
  return '(unclassified)';
}

// Build the full worklist. Returns { profile, items, attribute_summary }.
export function buildWorklist(products, toggles) {
  const { profile, items } = buildRelevanceMap(products, toggles);
  const payloads = items.map(({ product, attrs }) => itemPayload(product, attrs));

  const attribute_summary = {};
  for (const it of payloads) {
    for (const a of it.attrs) attribute_summary[a.attr] = (attribute_summary[a.attr] || 0) + 1;
  }
  return { profile, items: payloads, attribute_summary };
}

// Optional enrichment: borrow the auditor's per-product confidence/fixability tags for the owned
// attributes when the product appears in completeness-queue.csv / attributes-queue.csv. Products not
// in the queues (e.g. error-flagged) are left as-is. Mutates items in place; safe if files absent.
export function enrichFromQueues(items, analysisDir) {
  const queues = ['completeness-queue.csv', 'attributes-queue.csv'];
  const tagByProductAttr = new Map(); // `${product_id}::${attribute}` -> { confidence, fixability_class }
  for (const name of queues) {
    const path = `${analysisDir}/${name}`;
    if (!existsSync(path)) continue;
    let rows = [];
    try { rows = readCsv(path); } catch { rows = []; }
    for (const row of rows) {
      const key = `${row.product_id}::${row.attribute}`;
      if (!tagByProductAttr.has(key)) {
        tagByProductAttr.set(key, {
          confidence: row.confidence || null,
          fixability_class: row.fixability_class || null,
        });
      }
    }
  }
  if (tagByProductAttr.size === 0) return items;
  for (const it of items) {
    for (const a of it.attrs) {
      const tag = tagByProductAttr.get(`${it.product_id}::${a.feed_name}`);
      if (tag) {
        a.auditor_confidence = tag.confidence;
        a.auditor_fixability = tag.fixability_class;
      }
    }
  }
  return items;
}

// Deterministic PRNG (mulberry32) so a given seed reproduces a sample; vary the seed to re-sample.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Stratified sample across GPC verticals, lightly weighted toward items with the most fillable
// attributes (so the sample spans the catalog's category mix and shows real work). Deterministic
// given `seed`. Returns up to `n` item payloads.
export function stratifiedSample(items, n = 20, seed = 1) {
  if (items.length <= n) return items.slice();
  const rand = mulberry32(seed);

  // Group by vertical.
  const groups = new Map();
  for (const it of items) {
    const v = verticalOf(it);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(it);
  }
  // Within each group, sort by attr count desc, then shuffle ties by jittering equal-count buckets.
  for (const arr of groups.values()) {
    shuffleInPlace(arr, rand);
    arr.sort((a, b) => b.attrs.length - a.attrs.length);
  }

  // Round-robin across verticals proportional to group size, taking the most-fillable first.
  const verticalKeys = shuffleInPlace([...groups.keys()], rand);
  const cursors = new Map(verticalKeys.map((k) => [k, 0]));
  const picked = [];
  let progressed = true;
  while (picked.length < n && progressed) {
    progressed = false;
    for (const v of verticalKeys) {
      if (picked.length >= n) break;
      const arr = groups.get(v);
      const c = cursors.get(v);
      if (c < arr.length) {
        picked.push(arr[c]);
        cursors.set(v, c + 1);
        progressed = true;
      }
    }
  }
  return picked;
}
